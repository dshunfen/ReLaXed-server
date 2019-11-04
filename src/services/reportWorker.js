const worker = require('cloth/worker');
const colors = require('colors/safe')

const tmp = require('tmp-promise');
const path = require('path');
const fs = require('fs');
const merge = require('easy-pdf-merge');

const plugins = require('relaxedjs/src/plugins');
const { preConfigure } = require("relaxedjs/src/config");
const render = require('relaxedjs/src/render');

const ReportRecord = require('./reportRecord');

const { Cluster } = require('puppeteer-cluster');
const {
  performance,
  PerformanceObserver
} = require('perf_hooks');

const obs = new PerformanceObserver((items) => {
    items.getEntries().forEach((item) => {
        console.log(colors.blue(`### ${item.name} took ${item.duration} ms`))
    })
});
obs.observe({entryTypes: ['measure']});

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


async function setupCluster(assetPath) {
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE,
        maxConcurrency: 10,
        timeout: 60000,
        puppeteerOptions: puppeteerConfig,
    });

    cluster.on('taskerror', (err, data) => {
        console.log(`Error crawling ${data}: ${err.message}`);
    });

    await cluster.task(async ({page, data: pdfData}) => {
        return await render.fileToPdf(assetPath, relaxedGlobals, pdfData.tempHTMLPath, pdfData.pdfPath, {data: pdfData.sectionData}, page, pdfData.sectionName);
    });

    return cluster;
}

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
            const cluster = await setupCluster(assetPath);
            let pdfFiles = [];

            worker.send('status', ReportRecord.REPORT_STATUSES.GENERATING_PDF);

            performance.mark('single pdfs start');

            const tmpdirOptions = {unsafeCleanup: true};
            await tmp.withDir(async (o) => {

                let outputPath = devPath || o.path;

                if (reportData.sections) {
                    for (const [index, section] of reportData.sections.entries()) {
                        const sectionName = section.name;
                        const sectionData = section.data;

                        const tempHTMLPath = path.resolve(outputPath, `${index}.html`);
                        const pdfPath = path.resolve(outputPath, `${index}.pdf`);
                        pdfFiles.push(pdfPath);

                        cluster.queue({
                            tempHTMLPath: tempHTMLPath,
                            pdfPath: pdfPath,
                            sectionData: sectionData,
                            sectionName: sectionName
                        });
                    }
                    await cluster.idle();
                    await cluster.close();

                    performance.mark('single pdfs end');
                    performance.measure('Single PDFs Generation', 'single pdfs start', 'single pdfs end');
                    const fullReportPDF = path.resolve(outputPath, 'FullReport.pdf');
                    let mergeResult = await (() => {
                        return new Promise((resolve => {
                            merge(pdfFiles, fullReportPDF, (err) => {
                                if (err) {
                                    resolve(err);
                                }
                                resolve('Successfully merged!');
                            });
                        }));
                    })();
                    console.log(mergeResult);
                    performance.mark('pdfs merged');
                    performance.measure('Single PDFs merged', 'single pdfs end', 'pdfs merged');
                    output = fs.readFileSync(fullReportPDF);
                }
            }, tmpdirOptions);
        }
        else {
            // TODO - Render the html with webpack assetization
        }
        return Buffer.from(output, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    })().then(output => callback(null, output), error => callback(error));

});
