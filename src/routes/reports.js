const ReportRecord = require('../services/reportRecord');
const { reportIds } = require('../services/reports');

const express = require('express');

const router = express.Router();

// Root page that just shows that we have our server
router.get('/', (req, res) => {
  res.send('You have reached the ReLaXed REST server')
});

router.get('/reports', async (req, res) => {
  const basedir = req.app.locals.basedir;
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

  const basedir = req.app.locals.basedir;
  const availableReports = await reportIds(basedir);
  if(!availableReports.includes(reportId)) {
    res.status(404).send({error: `Report ${reportId} is not an available report to create`});
    return;
  }

  function doRender(updateStatus) {
    const pool = req.app.locals.pool;
    return new Promise((resolve, reject) => {
      const task = pool.run({
        reportId,
        format,
        pugContent,
      });
      task
          .on('end', resolve)
          .on('error', reject)
          .on('status', updateStatus);
    });
  }

  const reportParams = {reportId: reportId, format: format};

  const record = new ReportRecord(doRender, reportParams, req.app.locals.reportCache);

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
    res.send(record.getStatus());
  }
  else {
    res.status(404).send({detail: 'not found'});
  }
});

module.exports = router;
