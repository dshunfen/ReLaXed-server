const ReportRecord = require('./reportRecord');
const { reportIds } = require('../services/reports')

const express = require('express');
const tmp = require('tmp-promise');
const path = require('path');
const fs = require('fs');
const Email = require("email-templates");

const render = require('relaxedjs/src/render');

const router = express.Router();

// Root page that just shows that we have our server
router.get('/', (req, res) => {
  res.send('You have reached the ReLaXed REST server')
});

router.get('/reports', async (req, res) => {
  const basedir = res.app.get('relaxedGlobals').basedir;
  res.send(await reportIds(basedir));
});

router.get('/reports/pending', async (req, res) => {
  const pending = {};
  for (const [uuid, record] of Object.entries(req.app.locals.reportCache)) {
    pending[uuid] = record.isComplete();
  }
  res.send(pending);
});

router.post('/reports/:reportId', async (req, res) => {
  const reportId = req.params.reportId;
  const pugContent = req.body.content;
  const format = req.body.format;

  if(!['pdf', 'html'].includes(format)) {
    res.status(404).send({error: `Report format must be specified. Either "pdf" or "html"`});
    return;
  }

  const relaxedGlobals = res.app.get('relaxedGlobals');

  const basedir = relaxedGlobals.basedir;
  const availableReports = await reportIds(basedir)
  if(!availableReports.includes(reportId)) {
    res.status(404).send({error: `Report ${reportId} is not an available report to create`});
    return;
  }

  const puppeteerConfig = res.app.get('puppeteerConfig');

  const assetPath = path.resolve(relaxedGlobals.basedir, reportId);

  async function doRender() {
    const html = await render.contentToHtml(pugContent, assetPath, relaxedGlobals);
    let output = null;
    if(format === 'pdf') {
      const devPath = req.app.locals.devPath;
      const page = await render.browseToPage(puppeteerConfig);
      if (req.app.get('env') === 'development' && devPath) {
        if (!fs.existsSync(devPath)) {
          fs.mkdirSync(devPath);
        }
        console.log(`Writing development files to dir \'${devPath}\'`)
        fs.writeFileSync(path.resolve(devPath, 'report.pug'), pugContent)
        output = await render.contentToPdf(html, relaxedGlobals, devPath, page);
      }
      else {
        const tmpdirOptions = {unsafeCleanup: true};
        output = await tmp.withDir(o => {
          console.log(`Writing file to dir \'${o.path}\'`)
          return render.contentToPdf(html, relaxedGlobals, o.path, page);
        }, tmpdirOptions)
      }
      await page.browser().close();
    } else {
      const email = new Email({
          juice: true,
          juiceResources: {
              preserveImportant: true,
              webResources: {
                  relativeTo: assetPath,
                  images: true
              }
          },
          render: async (view, locals) => {
            return await email.juiceResources(view);
          }
      });
      output = await email.render(html);
    }
    output = Buffer.from(output, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    return output;
  }

  const reportParams = {reportId: reportId, format: format}

  const record = new ReportRecord(doRender(), reportParams, req.app.locals.reportCache);

  res.send({uuid: record.uuid})
});

router.get('/reports/:asyncId', async (req, res) => {
  const record = req.app.locals.reportCache[req.params.asyncId];
  if (record !== undefined) {
    const result = record.getResult();
    if(result.success) {
      res.send(result);
    } else {
      res.status(400).send(result);
    }
  }
  else {
    res.status(404).send({detail: 'not found'});
  }
});

router.get('/reports/:asyncId/status', async (req, res) => {
  const record = req.app.locals.reportCache[req.params.asyncId];
  if (record !== undefined) {
    res.send({complete: record.isComplete()});
  }
  else {
    res.status(404).send({detail: 'not found'});
  }
});

module.exports = router;
