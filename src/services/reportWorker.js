const worker = require('cloth/worker');

const tmp = require('tmp-promise');
const path = require('path');
const fs = require('fs');

const plugins = require('relaxedjs/src/plugins');
const { preConfigure } = require("relaxedjs/src/config");
const render = require('relaxedjs/src/render');

const ReportRecord = require('./reportRecord');


const puppeteerConfig = preConfigure(false);

const workerData = JSON.parse(worker.arguments[0]);

const relaxedGlobals = {
    busy: false,
    config: {},
    configPlugins: [],
    basedir: workerData.basedir,
    pageRenderingTimeout: 60,
};


async function init() {
    await plugins.initializePlugins();
    await plugins.updateRegisteredPlugins(relaxedGlobals, relaxedGlobals.basedir);
}
init().then(()=>console.log('initialized ReLaXed'), error => {
    console.error('ReLaXed initialization failed: %o', error);
    process.abort();  // TODO: is this the right way to exit?
});


worker.run((message, callback) => {
    if (message === 'STARTUP_PING') {
        callback(null, 'PONG');
        return;
    }
    (async () => {
        const assetPath = path.resolve(relaxedGlobals.basedir, message.reportId);
        const reportData = message.reportData;

        let devPath = null;
        if (workerData.env === 'development' && workerData.devPath) {
            devPath = workerData.devPath;
            if (!fs.existsSync(devPath)) {
                fs.mkdirSync(devPath);
            }
            console.log(`Writing development files to dir \'${devPath}\'`);
        }

        worker.send('status', ReportRecord.REPORT_STATUSES.GENERATING_HTML);
        let output = null;
        if (message.format === 'pdf') {
            worker.send('status', ReportRecord.REPORT_STATUSES.GENERATING_PDF);
            const page = await render.browseToPage(puppeteerConfig);
            try {
                const tmpdirOptions = {unsafeCleanup: true};
                output = await tmp.withDir(o => {
                    let outputPath = devPath || o.path;
                    const tempHTMLPath = path.resolve(outputPath, 'report.html')
                    const pdfPath = path.resolve(outputPath, 'report.pdf')
                    return render.fileToPdf(assetPath, relaxedGlobals, tempHTMLPath, pdfPath, reportData, page);
                }, tmpdirOptions)
            }
            finally {
                await page.browser().close().catch(console.error);
            }
        }
        else {
            // TODO - Render the html with webpack assetization
        }
        return Buffer.from(output, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    })().then(output => callback(null, output), error => callback(error));

});
