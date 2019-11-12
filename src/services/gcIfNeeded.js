function gcIfNeeded(force, outputSize) {
    const memStats = process.memoryUsage();
    if (force || outputSize > 30 * 1024 * 1024 || memStats.heapUsed > 250 * 1024 * 1024) {
        if (global.gc) {
            console.log('Running GC with memory stats: %s', memStats);
            global.gc();
        }
        else {
            console.warn('Would run GC, but it is not exposed.  Node needs to be run with --expose-gc.  Memory stats: %s', memStats);
        }
    }
}

module.exports = gcIfNeeded;
