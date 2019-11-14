const debug = require('debug')('relaxedjs:server:reports');
const path = require('path');
const fg = require('fast-glob');

async function reportIds(basedir) {
    debug("Going to retrieve report ID's for ", basedir);
    const entries = await fg([path.join(basedir, '*')], {onlyDirectories: true});
    return entries.map(absDir => path.basename(absDir))
}

exports.reportIds = reportIds;
