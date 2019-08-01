const express = require('express')
const path = require('path')
const fg = require('fast-glob')

const render = require('relaxedjs/src/render')

const router = express.Router()

// Root page that just shows that we have our server
router.get('/', (req, res) => {
  res.send('You have reached the ReLaXed REST server')
})

router.get('/reports', async (req, res) => {
  let basedir = res.app.get('basedir');
  const entries = await fg([path.join(basedir, '*')], { onlyDirectories: true })
  res.send(entries)
})

router.post('/reports/:reportId', async (req, res) => {
  console.log(req.params.reportId)
  let pugContent = req.body.content;
  console.log(pugContent)

  let puppeteerConfig = res.app.get('puppeteerConfig')
  let relaxedGlobals = res.app.get('relaxedGlobals')

  await render.browseToPage(puppeteerConfig, relaxedGlobals);

  res.send(await render.contentToHtml(pugContent, req.params.reportId, relaxedGlobals))
})

module.exports = router;

