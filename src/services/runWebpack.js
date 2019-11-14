const debug = require('debug')('relaxedjs:server:runWebpack');

const webpack = require('webpack');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin');

const generateWebpackConfig = function(htmlSourcePath, resourceManifestPath, outPath) {
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

process.on('message', message => {
    const {pugHtmlPath, resourceManifestPath, webpackOutDir} = message;
    debug('Running webpack');
    try {
        webpack(generateWebpackConfig(pugHtmlPath, resourceManifestPath, webpackOutDir), (err, stats) => {
            debug('Running webpack complete');
            if (err) {
                console.error('Webpack execution error:', err, err.stack, err.details);
                process.send({error: err});
            }
            else {
                const info = stats.toJson();
                if (stats.hasErrors()) {
                    debug('Compile errors:\n%s', info.errors.join('\n\n'));
                    process.send({error: info.errors});
                }
                if (stats.hasWarnings()) {
                    debug('Compile warnings:\n%s', info.warnings.join('\n\n'));
                }
            }
            process.disconnect();
        });
    }
    catch (e) {
        console.error('Error running webpack:', e);
        process.send({error: e.message || e});
        process.disconnect();
    }
});
