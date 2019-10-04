const uuidv4 = require('uuid/v4');

class ReportRecord {
    constructor(promise, report_params, reportCache) {
        this._report_params = report_params;
        this._uuid = uuidv4();
        this._reportCache = reportCache;
        this._success = null;
        this._output = null;
        reportCache[this.uuid] = this;
        promise.then(this._handleComplete.bind(this), this._handleError.bind(this));
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
            output: this._output,
        };
    }

    get uuid() {
        return this._uuid;
    }

    _handleComplete(output) {
        console.debug(this._uuid, output);
        this._output = output;
        this._success = true;
        this._cleanupIn(60 * 60 * 1000);  // 1 hour, reset timeout
    }

    _handleError(err) {
        console.error(this._uuid, err);
        this._output = err.message;
        this._success = false;
        this._cleanupIn(60 * 60 * 1000);  // 1 hour, reset timeout
    }

    _doCleanup() {
        if (this._output !== undefined) {
            console.log('Cleaning up report %s with id %s', this._reportId, this._uuid);
            delete this._reportCache[this._uuid];  // Remove this report record from the cache
            delete this._reportCache;  // Get rid of our reference to the report cache to eliminate potential circular references
            delete this._output;  // The output is the biggest part, so make sure it is deleted immediately
        }
        else {
            console.log('Report %s with id %s was already cleaned up', this._reportId, this._uuid);
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

module.exports = ReportRecord;
