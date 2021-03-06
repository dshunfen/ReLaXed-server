const debug = require('debug')('relaxedjs:server:gcIfNeeded');

function gcIfNeeded(force, outputSize) {
    const memStats = process.memoryUsage();
    if (force || outputSize > 30 * 1024 * 1024 || memStats.heapUsed > 250 * 1024 * 1024) {
        if (global.gc) {
            debug('Running GC with memory stats: %s', memStats);
            global.gc();
            const newMem = process.memoryUsage();
            debug('Memory stats after GC: %s\nFreed %s MB', newMem, Math.round((memStats.heapUsed-newMem.heapUsed)/1000)/1000)
        }
        else {
            console.warn('Would run GC, but it is not exposed.  Node needs to be run with --expose-gc.  Memory stats: %s', memStats);
        }
    }
}

module.exports = gcIfNeeded;
