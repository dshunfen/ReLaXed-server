const worker = require('cloth/worker');

const tmp = require('tmp-promise');
const path = require('path');
const fs = require('fs');
const Email = require("email-templates");

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
    basedir: workerData.basedir
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
        const pugContent = message.pugContent;

        let devPath = null;
        if (workerData.env === 'development' && workerData.devPath) {
            devPath = workerData.devPath;
            if (!fs.existsSync(devPath)) {
                fs.mkdirSync(devPath);
            }
            console.log(`Writing development files to dir \'${devPath}\'`);
            fs.writeFileSync(path.resolve(devPath, 'report.pug'), pugContent);
        }

        worker.send('status', ReportRecord.REPORT_STATUSES.GENERATING_HTML);
        const html = await render.contentToHtml(pugContent, assetPath, relaxedGlobals);
        let output = null;
        if (message.format === 'pdf') {
            worker.send('status', ReportRecord.REPORT_STATUSES.GENERATING_PDF);
            const page = await render.browseToPage(puppeteerConfig);
            try {
                const tmpdirOptions = {unsafeCleanup: true};
                output = await tmp.withDir(o => {
                    let path = devPath || o.path;
                    return render.contentToPdf(html, relaxedGlobals, path, page);
                }, tmpdirOptions)
            }
            finally {
                await page.browser().close().catch(console.error);
            }
        }
        else {
            const email = new Email({
                juice: true,
                juiceResources: {
                    preserveImportant: true,
                    webResources: {
                        relativeTo: assetPath,
                        images: true,
                        strict: true
                    }
                },
                render: async (view, locals) => {
                    return await email.juiceResources(view);
                }
            });
            output = await email.render(html);
        }
        return Buffer.from(output, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    })().then(output => callback(null, output), error => callback(error));

});
