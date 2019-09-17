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
  console.log('reportId',req.params.reportId)
  const pugContent = req.body.content;
  console.log('body', pugContent, req.body)

  const puppeteerConfig = res.app.get('puppeteerConfig');
  const relaxedGlobals = res.app.get('relaxedGlobals');

  async function doRender() {
    await render.browseToPage(puppeteerConfig, relaxedGlobals);
    return await render.contentToHtml(pugContent, req.params.reportId, relaxedGlobals);
  }

  const record = new ReportRecord(doRender(), req.app.locals.reportCache);

  res.send({uuid: record.uuid})
});

router.get('/reports/:asyncId', async (req, res) => {
  const record = req.app.locals.reportCache[req.params.asyncId];
  if (record !== undefined) {
    res.send(record.getResult());
  }
  else {
    res.status(404).send({detail: 'not found'});
  }
});

module.exports = router;
