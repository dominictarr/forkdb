var blob = require('content-addressable-blob-store');
var defined = require('defined');
var stringify = require('json-stable-stringify');
var mmm = require('multi-master-merge');
var wrap = require('level-option-wrap');
var has = require('has');
var through = require('through2');
var readonly = require('read-only-stream');
var isarray = require('isarray');
var copy = require('shallow-copy');

module.exports = ForkDB;

function ForkDB (db, opts) {
    if (!(this instanceof ForkDB)) return new ForkDB(db, opts);
    if (!opts) opts = {};
    this._mmm = mmm(db);
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
        
        self._mmm.fwdb.on('batch', function (rows) {
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
        self._mmm.put(key, copy(meta), function (err) {
            if (err) return w.emit('error', err);
            else if (cb) cb(null, w.key)
        });
    });
    return w;
};

ForkDB.prototype.heads = function (key, opts, cb) {
    return this._mmm.fwdb.heads(key, opts, cb);
};

ForkDB.prototype.keys = function (opts, cb) {
    return this._mmm.fwdb.keys(opts, cb);
};

ForkDB.prototype.tails = function (key, opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = {};
    }
    if (!opts) opts = {};
    var r = this._mmm.fwdb.db.createReadStream(wrap(opts, {
        gt: function (x) { return [ 'tail', key, null ] },
        lt: function (x) { return [ 'tail', key, undefined ] }
    }));
    var tr = through(function (row, enc, next) {
        this.push({ key: row.key[1], hash: row.key[2] });
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
    var r = this._mmm.fwdb.db.createReadStream(wrap(opts, {
        gt: function (x) { return [ 'meta', defined(x, null) ] },
        lt: function (x) { return [ 'meta', defined(x, undefined) ] }
    }));
    var tr = through.obj(function (row, enc, next) {
        this.push(row.value);
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
    this._mmm.fwdb.db.get([ 'meta', hash ], function (err, meta) {
        if (err && cb) cb(err)
        else if (cb) cb(null, meta)
    });
};

ForkDB.prototype.getLinks = function (hash, opts, cb) {
    return this._mmm.fwdb.links(hash, opts, cb);
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
    
    function onget (err, meta) {
        if (err) return r.emit('error', err)
        var prev = getPrev(meta);
        
        if (prev.length === 0) {
            next = null;
            r.push(meta);
        }
        else if (prev.length === 1) {
            next = prev[0].hash;
            r.push(meta);
        }
        else {
            next = null;
            r.push(meta);
            prev.forEach(function (p) {
                r.emit('branch', self.history(p.hash));
            });
        }
    }
};

ForkDB.prototype.future = function (hash) {
    var self = this;
    var output = through.obj();
    self.db.get([ 'meta', hash ], function (err, meta) {
        var r = future_(meta);
        r.on('branch', function (b) { ro.emit('branch', b) });
        r.pipe(output);
    });
    var ro = readonly(output);
    return ro;
    
    function future_ (meta) {
        var r = new Readable({ objectMode: true });
        var next = meta;
        
        r._read = function () {
            if (!next) return r.push(null);
            
            var crows = [];
            self.getLinks(next.hash).pipe(through.obj(write, end));
            
            function write (crow, enc, next) {
                crows.push(crow);
                next();
            }
            
            function end () {
                var prev = next;
                if (crows.length === 0) {
                    next = null;
                    r.push(prev);
                }
                else if (crows.length === 1) {
                    self.db.get([ 'meta', crows[0].hash ], function (err, v) {
                        next = v;
                        r.push(prev);
                    });
                }
                else {
                    next = null;
                    r.push(prev);
                    crows.forEach(function (crow) {
                        r.emit('branch', self.future(crow.hash));
                    });
                }
            }
        };
        return r;
    }
};

function getPrev (meta) {
    if (!meta) return [];
    if (!has(meta, 'prev')) return [];
    var prev = meta.prev;
    if (!isarray(prev)) prev = [ prev ];
    return prev.filter(Boolean);
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
