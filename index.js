var sublevel = require('level-sublevel/bytewise');
var bytewise = require('bytewise');
var blob = require('content-addressable-blob-store');
var defined = require('defined');
var isarray = require('isarray');
var through = require('through2');
var duplexer = require('duplexer2');
var stringify = require('json-stable-stringify');
var readonly = require('read-only-stream');
var combine = require('stream-combiner2');
var Readable = require('readable-stream').Readable;
var shasum = require('shasum');

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
    
    w.once('finish', function () {
        var rows = [];
        var prev = meta.prev || [];
        if (!isarray(prev)) prev = [ prev ];
        prev.filter(Boolean).forEach(function (p) {
            rows.push({ type: 'del', key: [ 'head', p.key, p.hash ] });
        });
        if (prev.length === 0) {
            rows.push({
                type: 'put',
                key: [ 'tail', key, w.key ],
                value: 0
            });
        }
        meta.prev = prev;
        
        var ref = { key: key, data: w.key, meta: meta };
        var hash = shasum(ref);
        rows.push({ type: 'put', key: [ 'head', key, hash ], value: w.key });
        rows.push({ type: 'put', key: [ 'meta-key', key, hash ], value: 0 });
        rows.push({ type: 'put', key: [ 'meta', hash ], value: ref });
        
        self.db.batch(rows, function (err) {
            if (err) w.emit('error', err)
            else if (cb) cb(null, hash)
        });
    });
    return w;
};

ForkDB.prototype.heads = function (key) {
    var gkey = key === undefined ? null : key;
    var opts = {
        gt: [ 'head', gkey, null ],
        lt: [ 'head', key, undefined ]
    };
    return readonly(combine([
        this.db.createReadStream(opts),
        through.obj(function (row, enc, next) {
            this.push({
                key: row.key[1],
                hash: row.key[2]
            });
            next();
        })
    ]));
};

ForkDB.prototype.tails = function (key) {
    var gkey = key === undefined ? null : key;
    var opts = {
        gt: [ 'tail', gkey, null ],
        lt: [ 'tail', key, undefined ]
    };
    return readonly(combine([
        this.db.createReadStream(opts),
        through.obj(function (row, enc, next) {
            this.push({
                key: row.key[1],
                hash: row.key[2]
            });
            next();
        })
    ]));
};

ForkDB.prototype.all = function (key, cb) {
    var opts = {
        gt: [ 'meta-key', key, null ],
        lt: [ 'meta-key', key, undefined ]
    };
    return readonly(combine([
        this.db.createReadStream(opts),
        through.obj(function (row, enc, next) {
            this.push({
                key: row.key[1],
                hash: row.key[2]
            });
            next();
        })
    ]));
};

ForkDB.prototype.meta = function (hash, cb) {
    this.db.get([ 'meta', hash ], cb);
};

ForkDB.prototype.revert = function () {
};

ForkDB.prototype.get = function (hash, cb) {
    var self = this;
    var output = through();
    if (cb) output.on('error', cb);
    
    if (typeof hash === 'object') {
        return self.store.createReadStream({ key: hash.data });
    }
    self.db.get([ 'meta', hash ], function (err, row) {
        if (err) return output.emit('error', err);
        self.store.createReadStream({ key: row.data }).pipe(output);
    });
    return readonly(output);
};

ForkDB.prototype.history = function (hash) {
    var self = this;
    var r = new Readable({ objectMode: true });
    var next = hash;
    
    r._read = function () {
        if (!next) return r.push(null);
        
        self.db.get([ 'meta', next ], function (err, row) {
            if (err) return r.emit('error', err)
            row.hash = next;
            
            if (!row.meta || !row.meta.prev || row.meta.prev.length === 0) {
                next = null;
                r.push(row);
            }
            else if (row.meta.prev.length === 1) {
                next = row.meta.prev[0].hash;
                r.push(row);
            }
            else {
                next = null;
                r.push(row);
                row.meta.prev.forEach(function (p) {
                    r.emit('branch', self.history(p.key, p.hash));
                });
            }
        });
    };
    return r;
};
