const worker = require('cloth/worker');

const tmp = require('tmp-promise');
const path = require('path');
const fs = require('fs');
const util = require('util');

const plugins = require('relaxedjs/src/plugins');
const { preConfigure } = require("relaxedjs/src/config");
const render = require('relaxedjs/src/render');

const ReportRecord = require('./reportRecord');

const puppeteerConfig = preConfigure(false);

const webpack = require('webpack');
const webpackP = util.promisify(webpack);

const HtmlWebpackPlugin = require('html-webpack-plugin')
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin');

const preConfigureWebpack = function(htmlSourcePath, resourceManifestPath, outPath) {
    return {
        mode: 'production',
        entry: resourceManifestPath,
        output: {
            path: outPath,
            filename: 'bundle.js'
        },
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: [
                        'style-loader',
                        'css-loader'
                    ]
                },
                {
                    test: /\.scss$/,
                    use: [
                        'style-loader',
                        'css-loader',
                        'sass-loader'
                    ]
                },
                {
                    test: /\.png$/,
                    use: [
                        {
                            loader: 'url-loader',
                            options: {
                                mimetype: 'image/png'
                            }
                        }
                    ]
                },
                {
                    test: /\.(png|woff|woff2|eot|ttf|svg)$/,
                    use: ['url-loader?limit=10000000']
                }
            ]
        },
        plugins: [
            new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/),
            new HtmlWebpackPlugin({
                inject: 'head',
                template: htmlSourcePath,
                inlineSource: '.(js)$',
            }),
            new HtmlWebpackInlineSourcePlugin()
        ]
    };
};

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
            const pugHtmlPath = path.resolve(outputPath, 'report.html')
            const resourceManifestPath = path.resolve(assetPath, 'index.js');
            const webpackOutDir = path.resolve(outputPath, 'out');
            const bundledHtmlPath = path.resolve(outputPath, 'out', 'index.html');
            const html = await render.generateHtmlFromPath(assetPath, relaxedGlobals, reportData);
            fs.writeFileSync(pugHtmlPath, html);
            let stats = await webpackP(preConfigureWebpack(pugHtmlPath, resourceManifestPath, webpackOutDir));
            if(stats.compilation.errors.length > 0) {
                const errors = stats.compilation.errors.map(err => err.message).join('\n');
                console.error(errors);
            }
            if (message.format === 'pdf') {
                const pdfPath = path.resolve(outputPath, 'report.pdf')
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
        return Buffer.from(output, 'binary').toString('base64');  // Base64 encode to safely include in JSON
    })().then(output => callback(null, output), error => callback(error));

});
