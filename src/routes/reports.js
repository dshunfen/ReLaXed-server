const ReportRecord = require('./reportRecord');

const express = require('express');
const path = require('path');
const fg = require('fast-glob');

const render = require('relaxedjs/src/render');

const router = express.Router();

// Root page that just shows that we have our server
router.get('/', (req, res) => {
  res.send('You have reached the ReLaXed REST server')
});

router.get('/reports', async (req, res) => {
  const basedir = res.app.get('relaxedGlobals').basedir;
  console.log('basedir', basedir)
  const entries = await fg([path.join(basedir, '*')], { onlyDirectories: true });
  res.send(entries);
});

router.get('/reports/pending', async (req, res) => {
  const pending = {};
  for (const [uuid, record] of Object.entries(req.app.locals.reportCache)) {
    pending[uuid] = record.isComplete();
  }
  res.send(pending);
});

router.post('/reports/:reportId', async (req, res) => {
  const reportName = req.params.reportId;
  console.log('reportName', reportName)
  const pugContent = req.body.content;
  console.log('body', pugContent, req.body)

  const puppeteerConfig = res.app.get('puppeteerConfig');
  const relaxedGlobals = res.app.get('relaxedGlobals');

  async function doRender() {
    await render.browseToPage(puppeteerConfig, relaxedGlobals);
    const html = await render.contentToHtml(pugContent, reportName, relaxedGlobals);
    let pdf = await render.contentToPdf(html, relaxedGlobals, '/tmp/render_tmp.html', '/tmp/render_tmp.pdf');
    pdf = Buffer.from(pdf, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    return {html, pdf};
  }

  const record = new ReportRecord(doRender(), req.app.locals.reportCache);

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

module.exports = router;
