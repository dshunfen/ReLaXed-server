const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const plugins = require('relaxedjs/src/plugins')

// HTTP stuff
const createError = require('http-errors')
const cookieParser = require('cookie-parser')
const logger = require('morgan')

const reportsRouter = require("./routes/reports")
const { preConfigure } = require("relaxedjs/src/config");

const app = express()

app.use(logger('dev'));
app.use(express.json({
  limit: '50mb',
}));
app.use(express.urlencoded({
  extended: false,
  type: 'application/json',
  limit: '50mb',
}));
app.use(cookieParser());
if (process.env.DEV_PATH) {
  app.use('/static', express.static(process.env.DEV_PATH))
}

// app.locals.program = program
app.use(bodyParser.json());
app.use('/', reportsRouter)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: err
  });
});

async function init() {
  var puppeteerConfig = preConfigure(false)

  var relaxedGlobals = {
    busy: false,
    config: {},
    configPlugins: [],
    basedir: process.env.BASEDIR
  }

  await plugins.initializePlugins()
  await plugins.updateRegisteredPlugins(relaxedGlobals, relaxedGlobals.basedir)

  app.set('puppeteerConfig', puppeteerConfig)
  app.set('relaxedGlobals', relaxedGlobals)
  app.locals.reportCache = {};
  app.locals.devPath = process.env.DEV_PATH;

  console.log("Finished initializing the server!")
}
init()

module.exports = app;
