const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const Pool = require('cloth/pool');
const os = require('os');
const debug = require('debug')('relaxedjs:server');

// HTTP stuff
const createError = require('http-errors')
const cookieParser = require('cookie-parser')
const logger = require('morgan')

const reportsRouter = require("./routes/reports")

const app = express()

app.use(logger('[:date[iso]] :method :url :status :response-time ms - :req[content-length] - :res[content-length]'));
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

function init() {

  for (let i = 0; i <process.execArgv.length; i++) {
    const arg = process.execArgv[i];
    if (arg.startsWith('--inspect')) {
      debug("initial process.execArgv: %o", process.execArgv);
      debug('Node is running with --inspect for debugging; modify process.execArgv so worker processes bind to a different port');
      const li = arg.lastIndexOf(':');
      if (li > -1) {
        process.execArgv[i] = arg.slice(0, li+1).replace('-brk','') + '0';
      }
      debug("new process.execArgv: %o", process.execArgv);
    }
  }


  let workerCount = parseInt(process.env.REPORT_WORKER_COUNT);
  if (!workerCount) {
    if (app.get('env') === 'development') {
      workerCount = 1;
    }
    else {
      workerCount = Math.max(os.cpus()/4, 1);
    }
  }
  debug("Using %s worker processes", workerCount);
  const pool = new Pool(__dirname + '/services/reportWorker.js', {
    arguments: [JSON.stringify({
      basedir: process.env.BASEDIR,
      devPath: process.env.DEV_PATH,
      env: app.get('env'),
    })],
    workers: workerCount,
  });
  pool.on('error', (err, task) => {
    console.error('Pool error: %o', err);
    if (task) {
      if (task.command && task.command.reportData) {
        // TODO: May want to print out key reportData here from task.command.reportData
      }
      debug('Task: %o', task);
    }
  });

  const task = pool.run('STARTUP_PING');  // TODO: make this a constant
  task.on('end', (msg) => {
    if (msg !== 'PONG') {
      console.error('Initialization task returned %o instead of expected "PONG", aborting server', msg);
      process.abort();
    }
    debug('Initialization task output: %o', msg);
  });
  task.on('error', (err) => {
    console.error('Initialization task failed, aborting server: %o', err);
    process.abort();
  });

  app.locals.pool = pool;
  app.locals.reportCache = {};
  app.locals.devPath = process.env.DEV_PATH;
  app.locals.basedir = process.env.BASEDIR;

  console.log("Finished initializing the server!")
}
init()

module.exports = app;
