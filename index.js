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
var has = require('has');

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

ForkDB.prototype.createWriteStream = function (meta, cb) {
    var self = this;
    if (typeof meta === 'function') {
        cb = meta;
        meta = {};
    }
    if (!meta || typeof meta !== 'object') meta = {};
    
    var w = this.store.createWriteStream();
    w.write(stringify(meta) + '\n');
    if (cb) w.on('error', cb);
    
    w.once('finish', function () {
        var prev = getPrev(meta);
        var ref = { hash: w.key, meta: meta };
        var rows = [];
        
        if (prev.length === 0) {
            rows.push({ type: 'put', key: [ 'tail', meta.key, w.key ], value: 0 });
        }
        prev.forEach(function (p) {
            rows.push({
                type: 'del',
                key: [ 'head', p.key, p.hash ],
                value: 0
            });
            rows.push({
                type: 'put',
                key: [ 'link', p.hash, w.key ],
                value: meta.key
            });
        });
        rows.push({ type: 'put', key: [ 'head', meta.key, w.key ], value: 0 });
        rows.push({ type: 'put', key: [ 'meta', w.key ], value: ref });
        
        self.db.batch(rows, function (err) {
            if (err) w.emit('error', err)
            else if (cb) cb(null, w.key)
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
    var opts = {
        gt: [ 'tail', defined(key, null), null ],
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

ForkDB.prototype.all = function (opts) {
    if (!opts) opts = {};
    var opts = {
        gt: [ 'meta', defined(opts.gt, null) ],
        lt: [ 'meta', defined(opts.lt, undefined) ]
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

ForkDB.prototype.get = function (hash, cb) {
    var self = this;
    var output = through();
    if (cb) output.on('error', cb);
    
    var r = self.store.createReadStream({ key: hash });
    var line = false;
    return readonly(r.pipe(through(write)));
    
    function write (buf, enc, next) {
        if (line) {
            this.push(buf);
            return next();
        }
        for (var i = 0; i < buf.length; i++) {
            if (buf[i] === 10) {
                line = true;
                this.push(buf.slice(i+1));
                return next();
            }
        }
    }
};

ForkDB.prototype.getMeta = function (hash, cb) {
    this.db.get([ 'meta', hash ], cb);
};

ForkDB.prototype.getLinks = function (hash) {
    var ghash = hash === undefined ? null : hash;
    var opts = {
        gt: [ 'link', ghash, null ],
        lt: [ 'link', hash, undefined ]
    };
    return readonly(combine([
        this.db.createReadStream(opts),
        through.obj(function (row, enc, next) {
            this.push({
                key: row.value,
                hash: row.key[2]
            });
            next();
        })
    ]));
};

ForkDB.prototype.history = function (hash) {
    var self = this;
    var r = new Readable({ objectMode: true });
    var next = hash;
    
    r._read = function () {
        if (!next) return r.push(null);
        
        self.db.get([ 'meta', next ], onget);
    };
    return r;
    
    function onget (err, row) {
        if (err) return r.emit('error', err)
        var prev = getPrev(row && row.meta);
        
        if (prev.length === 0) {
            next = null;
            r.push(row);
        }
        else if (prev.length === 1) {
            next = prev[0].hash;
            r.push(row);
        }
        else {
            next = null;
            r.push(row);
            prev.forEach(function (p) {
                r.emit('branch', self.history(p.hash));
            });
        }
    }
};

ForkDB.prototype.future = function (hash) {
};

function getPrev (meta) {
    if (!meta) return [];
    if (!has(meta, 'prev')) return [];
    var prev = meta.prev;
    if (!isarray(prev)) prev = [ prev ];
    return prev.filter(Boolean);
}
