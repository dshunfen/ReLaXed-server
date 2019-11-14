const uuidv4 = require('uuid/v4');
const debug = require('debug')('relaxedjs:server:reportRecord');
const gcIfNeeded = require('./gcIfNeeded');

const REPORT_STATUSES = {
    RECEIVED: 'Received',
    GENERATING_HTML: 'Generating HTML',
    GENERATING_PDF: 'Generating PDF',
    FINISHED: 'Finished',
};
const REPORT_STATUSES_INVERSE = {};
Object.entries(REPORT_STATUSES).forEach(e => {REPORT_STATUSES_INVERSE[e[1]] = e[0]});

class ReportRecord {
    constructor(runFunc, report_params, reportCache) {
        this._report_params = report_params;
        this._uuid = uuidv4();
        this._reportCache = reportCache;
        this._status = REPORT_STATUSES.RECEIVED;
        this._success = null;
        this._output = null;
        reportCache[this._uuid] = this;
        runFunc(this._handleStatus.bind(this), this._uuid).then(this._handleComplete.bind(this), this._handleError.bind(this));
        this._cleanupIn(60 * 60 * 1000);  // 1 hour
    }

    isComplete() {
        return this._success !== null;
    }

    getResult() {
        // TODO: bail or complain if not yet complete
        this._cleanupIn(5 * 60 * 1000);  // Give 5 minutes to re-request report if needed
        return {
            ...this._report_params,
            uuid: this._uuid,
            success: this._success,
            status: this._status,
            output: this._output,
        };
    }

    getStatus() {
        return {
            ...this._report_params,
            uuid: this._uuid,
            success: this._success,
            status: this._status,
            complete: this.isComplete(),
        };
    }

    get uuid() {
        return this._uuid;
    }

    _handleComplete(output) {
        console.debug('Finished generating %s', this._uuid);
        this._output = output;
        this._success = true;
        this._status = REPORT_STATUSES.FINISHED;
        this._cleanupIn(60 * 60 * 1000);  // 1 hour, reset timeout
    }

    _handleError(err) {
        console.error(this._uuid, err);
        this._output = err.message || err;
        this._success = false;
        this._status = REPORT_STATUSES.FINISHED;
        this._cleanupIn(60 * 60 * 1000);  // 1 hour, reset timeout
    }

    _handleStatus(status) {
        if (!REPORT_STATUSES_INVERSE[status]) {
            throw 'Unknown status: ' + status
        }
        debug('%s set status to %o', this._uuid, status);
        this._status = status;
        this._cleanupIn(60 * 60 * 1000);  // 1 hour, reset timeout
    }

    _doCleanup() {
        if (this._output !== undefined) {
            console.log('Cleaning up report id %s', this._uuid);
            const outputSize = this._output ? this._output.length : 0;
            delete this._reportCache[this._uuid];  // Remove this report record from the cache
            const noReportsLeft = isEmpty(this._reportCache);
            delete this._reportCache;  // Get rid of our reference to the report cache to eliminate potential circular references
            delete this._output;  // The output is the biggest part, so make sure it is deleted immediately and doesn't stick around if this object isn't garbage collected
            setTimeout(gcIfNeeded, 0, noReportsLeft, outputSize);  // Queue a full garbage collection run since Node doesn't seem to realize it needs to do garbage collection
        }
        else {
            console.log('Report id %s was already cleaned up', this._uuid);
        }
    }

    _cleanupIn(timeout) {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
            delete this.timeout;
        }
        this.timeout = setTimeout(this._doCleanup.bind(this), timeout);
    }
}

ReportRecord.REPORT_STATUSES = REPORT_STATUSES;

function isEmpty(obj) {
    for(let prop in obj) {
        if(obj.hasOwnProperty(prop))
            return false;
    }
    return true;
}

module.exports = ReportRecord;
