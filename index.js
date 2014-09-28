var sublevel = require('level-sublevel/bytewise');
var bytewise = require('bytewise');
var blob = require('content-addressable-blob-store');
var defined = require('defined');
var isarray = require('isarray');
var through = require('through2');
var duplexer = require('duplexer2');
var parse = require('parse-header-stream');
var json = require('json-stable-stringify');

module.exports = ForkDB;

function ForkDB (db, opts) {
    if (!(this instanceof ForkDB)) return new ForkDB(db, opts);
    if (!opts) opts = {};
    
    this.db = sublevel(db, {
        keyEncoding: bytewise,
        valueEncoding: 'json'
    });
    this.store = defined(
        opts.store,
        blob({ dir: defined(opts.dir, './forkdb.blobs') })
    );
}

ForkDB.prototype.createWriteStream = function (key, meta, cb) {
    var self = this;
    if (typeof meta === 'function') {
        cb = meta;
        meta = {};
    }
    if (!meta || typeof meta !== 'object') meta = {};
    
    var w = this.store.createWriteStream();
    if (cb) w.on('error', cb);
    
    Object.keys(meta).sort().forEach(function (key) {
        var value = meta[key];
        w.write(json.stringify(key) + ':' + json.stringify(value) + '\n');
    });
    
    w.once('finish', function () {
        var rows = [
            { type: 'put', key: [ 'head', key, w.key ], value: 0 },
            { type: 'put', key: [ 'meta', w.key ], value: meta },
        ];
        var prev = meta.prev || [];
        if (!isarray(prev)) prev = [ prev ];
        prev.filter(Boolean).forEach(function (id) {
            rows.push({ type: 'del', key: [ 'head', key, id ] });
        });
        
        self.db.batch(rows, function (err) {
            if (err) w.emit('error', err)
            else if (cb) cb(null, w.key)
        });
    });
    return w;
};

ForkDB.prototype.heads = function (key) {
    var opts = {
        gt: [ 'head', key, null ],
        lt: [ 'head', key, undefined ]
    };
    return this.db.createReadStream(opts);
};

ForkDB.prototype.tails = function () {
    var opts = {
        gt: [ 'tail', key, null ],
        lt: [ 'tail', key, undefined ]
    };
    return this.db.createReadStream(opts);
};

ForkDB.prototype.meta = function (id, cb) {
    this.db.get([ 'meta', id ], cb);
};

ForkDB.prototype.revert = function () {
};

ForkDB.prototype.get = function (id, cb) {
    var r = this.store.createReadStream({ key: id });
    var output = through();
    var p = parse(function (err, headers) {
        if (err) return p.emit('error', err);
        var meta = {};
        Object.keys(headers).forEach(function (key) {
            var value = undefined;
            try { value = JSON.parse(headers[key]) }
            catch (err) { value = headers[key] }
            meta[key] = value;
        });
        this.emit('meta', meta);
        if (cb) cb(null, meta);
    });
    r.on('error', function (err) { dup.emit('error', err) });
    p.once('body', function (body) {
        body.pipe(output)
    });
    var dup = duplexer(r.pipe(p), output);
    if (cb) dup.on('error', cb);
    return dup;
};

ForkDB.prototype.history = function (id) {
    var opts = {
        gt: [ 'tail', key, null ],
        lt: [ 'tail', key, undefined ]
    };
    return this.db.createReadStream(opts);
};
