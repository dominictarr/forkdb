var blob = require('content-addressable-blob-store');
var defined = require('defined');
var sublevel = require('level-sublevel');
var stringify = require('json-stable-stringify');
var wrap = require('level-option-wrap');
var has = require('has');
var through = require('through2');
var Readable = require('readable-stream').Readable;
var readonly = require('read-only-stream');
var isarray = require('isarray');
var copy = require('shallow-copy');
var scuttleup = require('scuttleup');
var fwdb = require('fwdb');

module.exports = ForkDB;

function ForkDB (db, opts) {
    if (!(this instanceof ForkDB)) return new ForkDB(db, opts);
    if (!opts) opts = {};
    var sub = sublevel(db);
    this._fwdb = fwdb(db); // fwdb doesn't work with sublevels :/
    this._log = scuttleup(sub.sublevel('seq'));
    this.store = defined(
        opts.store,
        blob({ dir: defined(opts.dir, './forkdb.blob') })
    );
}

ForkDB.prototype.replicate = function (opts, cb) {
    // ...
};

ForkDB.prototype.createWriteStream = function (meta, opts, cb) {
    var self = this;
    if (typeof meta === 'function') {
        cb = meta;
        opts = {};
        meta = {};
    }
    if (!meta || typeof meta !== 'object') meta = {};
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }
    if (!opts) opts = {};
    
    var w = this.store.createWriteStream();
    w.write(stringify(meta) + '\n');
    if (cb) w.on('error', cb);
    
    w.once('finish', function () {
        var prev = getPrev(meta);
        var doc = { hash: w.key, key: meta.key, prev: prev };
        
        self._fwdb.on('batch', function (rows) {
            if (prev.length === 0) {
                rows.push({
                    type: 'put',
                    key: [ 'tail', meta.key, w.key ],
                    value: 0
                });
            }
            rows.push({ type: 'put', key: [ 'meta', w.key ], value: meta });
        });
        
        var key = defined(meta.key, 'undefined');
        self._fwdb.create(doc, function (err) {
            if (err) return w.emit('error', err);
            else if (cb) cb(null, w.key)
        });
    });
    return w;
};

ForkDB.prototype.heads = function (key, opts, cb) {
    return this._fwdb.heads(key, opts, cb);
};

ForkDB.prototype.keys = function (opts, cb) {
    return this._fwdb.keys(opts, cb);
};

ForkDB.prototype.tails = function (key, opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }
    if (!opts) opts = {};
    var r = this._fwdb.db.createReadStream(wrap(opts, {
        gt: function (x) { return [ 'tail', key, null ] },
        lt: function (x) { return [ 'tail', key, undefined ] }
    }));
    var tr = through.obj(function (row, enc, next) {
        this.push({ hash: row.key[2] });
        next();
    });
    r.on('error', function (err) { tr.emit('error', err) });
    if (cb) tr.pipe(collect(cb));
    if (cb) tr.on('error', cb);
    return readonly(r.pipe(tr));
};

ForkDB.prototype.list = function (opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }
    if (!opts) opts = {};
    var r = this._fwdb.db.createReadStream(wrap(opts, {
        gt: function (x) { return [ 'meta', defined(x, null) ] },
        lt: function (x) { return [ 'meta', defined(x, undefined) ] }
    }));
    var tr = through.obj(function (row, enc, next) {
        this.push({ meta: row.value, hash: row.key[1] });
        next();
    });
    r.on('error', function (err) { tr.emit('error', err) });
    if (cb) tr.pipe(collect(cb));
    if (cb) tr.on('error', cb);
    return readonly(r.pipe(tr));
};

ForkDB.prototype.get = function (hash) {
    var r = this.store.createReadStream({ key: hash });
    return readonly(r.pipe(dropFirst()));
};

ForkDB.prototype.getMeta = function (hash, cb) {
    this._fwdb.db.get([ 'meta', hash ], function (err, meta) {
        if (err && cb) cb(err)
        else if (cb) cb(null, meta)
    });
};

ForkDB.prototype.getLinks = function (hash, opts, cb) {
    return this._fwdb.links(hash, opts, cb);
};

ForkDB.prototype.history = function (hash) {
    var self = this;
    var r = new Readable({ objectMode: true });
    var next = hash;
    
    r._read = function () {
        if (!next) return r.push(null);
        self.getMeta(next, onget);
    };
    return r;
    
    function onget (err, meta) {
        if (err) return r.emit('error', err)
        var hash = next;
        var prev = getPrev(meta);
        
        if (prev.length === 0) {
            next = null;
            r.push({ hash: hash, meta: meta });
        }
        else if (prev.length === 1) {
            next = hashOf(prev[0]);
            r.push({ hash: hash, meta: meta });
        }
        else {
            next = null;
            r.push({ hash: hash, meta: meta });
            prev.forEach(function (p) {
                r.emit('branch', self.history(hashOf(p)));
            });
        }
    }
};

function hashOf (p) {
    return p && typeof p === 'object' ? p.hash : p;
}

ForkDB.prototype.future = function (hash) {
    var self = this;
    var r = new Readable({ objectMode: true });
    var next = hash;
    
    r._read = function () {
        if (!next) return r.push(null);
        
        self.getLinks(next, function (err, crows) {
            var prev = next;
            if (crows.length === 0) {
                next = null;
                r.push({ hash: prev });
            }
            else if (crows.length === 1) {
                next = hashOf(crows[0]);
                r.push({ hash: prev });
            }
            else {
                next = null;
                r.push({ hash: prev });
                crows.forEach(function (crow) {
                    r.emit('branch', self.future(hashOf(crow)));
                });
            }
        });
    };
    return r;
};

function getPrev (meta) {
    if (!meta) return [];
    if (!has(meta, 'prev')) return [];
    var prev = meta.prev;
    if (!isarray(prev)) prev = [ prev ];
    return prev.map(function (p) {
        if (p && typeof p === 'object' && p.hash) return p.hash;
        return p;
    }).filter(Boolean);
}

function dropFirst (cb) {
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
}

function collect (cb) {
    var rows = [];
    return through.obj(write, end);
    function write (row, enc, next) { rows.push(row); next() }
    function end () { cb(null, rows) }
}
