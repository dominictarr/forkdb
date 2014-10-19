var through = require('through2');

module.exports = function (cb) {
    var self = this;
    var line = false;
    var bufs = cb ? [] : null;
    return through(function (buf, enc, next) {
        if (line) {
            this.push(buf);
            return next();
        }
        for (var i = 0; i < buf.length; i++) {
            if (buf[i] === 10) {
                line = true;
                if (bufs) bufs.push(buf.slice(0,i));
                if (cb) {
                    var b = Buffer.concat(bufs).toString('utf8');
                    try { var meta = JSON.parse(b) }
                    catch (err) { return cb(err) }
                    cb(null, meta);
                }
                this.push(buf.slice(i+1));
                return next();
            }
        }
        if (bufs) bufs.push(buf);
    });
};
