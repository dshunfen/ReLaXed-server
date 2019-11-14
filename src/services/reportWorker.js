const debug = require('debug')('relaxedjs:server:reportWorker');

const worker = require('cloth/worker');

const cp = require('child_process');
const tmp = require('tmp-promise');
const path = require('path');
const fs = require('fs');

const plugins = require('relaxedjs/src/plugins');
const { preConfigure } = require("relaxedjs/src/config");
const render = require('relaxedjs/src/render');

const gcIfNeeded = require('./gcIfNeeded');
const ReportRecord = require('./reportRecord');

const puppeteerConfig = preConfigure(false);

const workerData = JSON.parse(worker.arguments[0]);

const relaxedGlobals = {
    busy: false,
    config: {},
    configPlugins: [],
    basedir: workerData.basedir,
    pageRenderingTimeout: 60,
    pageWidth: '8.5in',
    pageHeight: '11in',
};


async function init() {
    await plugins.initializePlugins();
    await plugins.updateRegisteredPlugins(relaxedGlobals, relaxedGlobals.basedir);
}
init().then(() => console.log('Initialized ReLaXed'), error => {
    console.error('ReLaXed initialization failed: %o', error);
    process.abort();  // TODO: is this the right way to exit?
});


worker.run((message, callback) => {
    if (message === 'STARTUP_PING') {
        callback(null, 'PONG');
        return;
    }
    (async () => {
        console.log('Starting to generate %s with UUID %s', message.reportId, message.uuid);
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
        const tmpdirOptions = {unsafeCleanup: true};
        let output = await tmp.withDir(async o => {
            let outputPath = devPath || o.path;
            const pugHtmlPath = path.resolve(outputPath, 'report.html');
            const resourceManifestPath = path.resolve(assetPath, 'index.js');
            const webpackOutDir = path.resolve(outputPath, 'out');
            const bundledHtmlPath = path.resolve(outputPath, 'out', 'index.html');
            const html = await render.generateHtmlFromPath(assetPath, relaxedGlobals, reportData);
            fs.writeFileSync(pugHtmlPath, html);

            await runWebpack(pugHtmlPath, resourceManifestPath, webpackOutDir);

            if (message.format === 'pdf') {
                const pdfPath = path.resolve(outputPath, 'report.pdf');
                worker.send('status', ReportRecord.REPORT_STATUSES.GENERATING_PDF);
                const page = await render.browseToPage(puppeteerConfig);
                try {
                    return await render.renderPdf(relaxedGlobals, bundledHtmlPath, pdfPath, page)
                }
                finally {
                    await page.browser().close().catch(console.error);
                }
            } else {
                return fs.readFileSync(bundledHtmlPath, 'utf8');
            }
        }, tmpdirOptions);

        setTimeout(gcIfNeeded, 1000, true);
        return Buffer.from(output, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    })().then(output => callback(null, output), error => callback(error));

});

async function runWebpack(pugHtmlPath, resourceManifestPath, webpackOutDir) {
    return new Promise((resolve, reject) => {
        const proc = cp.fork(`${__dirname}/runWebpack.js`);
        let completed = false;

        proc.on('message', (message) => {
            debug('Got message from webpack runner:', message);
            if (message.error) {
                completed = true;
                reject(message.error);
            }
            else {
                console.warn('Got unnexpected message from webpack runner:', message)
            }
        });

        proc.on('disconnect', () => {
            debug('Webpack runner disconnected, must be complete (already completed: %s)', completed);
            if (!completed) {
                completed = true;
                resolve(true);
            }
        });

        proc.on('exit', (code, signal) => {
            debug('Webpack runner exited; code: %s, signal: %s, completed: %s', code, signal, completed);
            if (!completed) {
                completed = true;
                if (code === 0) {
                    resolve(true);
                }
                else if (code !== null) {
                    reject('Webpack runner exited with code ' + code);
                }
                else {
                    reject('Webpack runner exited due to signal ' + signal);
                }
            }
        });

        // Tell the runner what to bundle
        proc.send({pugHtmlPath, resourceManifestPath, webpackOutDir});
    });
}
