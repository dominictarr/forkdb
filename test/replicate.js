var test = require('tape');
var path = require('path');
var level = require('level');
var mkdirp = require('mkdirp');
var through = require('through2');
var concat = require('concat-stream');
var forkdb = require('../');

var tmpdir = path.join(
    require('osenv').tmpdir(),
    'forkdb-test-' + Math.random()
);
var tmp = { a: path.join(tmpdir, 'a'), b: path.join(tmpdir, 'b') };
mkdirp.sync(tmp.a);
mkdirp.sync(tmp.b);

var db = {
    a: level(path.join(tmp.a, 'db')),
    b: level(path.join(tmp.b, 'db'))
};
var fdb = {
    a: forkdb(db.a, { dir: path.join(tmp.a, 'blob') }),
    b: forkdb(db.b, { dir: path.join(tmp.b, 'blob') })
};

var hashes = [
    '9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0',
    'fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99',
    'c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc',
    'e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d'
];

test('populate replicate', function (t) {
    var docs = { a: [], b: [] };
    docs.a.push({
        hash: hashes[0],
        body: 'beep boop\n',
        meta: { key: 'blorp' }
    });
    docs.b.push({
        hash: hashes[1],
        body: 'BEEP BOOP\n',
        meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        }
    });
    docs.a.push({
        hash: hashes[2],
        body: 'BeEp BoOp\n',
        meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        }
    });
    docs.b.push({
        hash: hashes[2],
        body: 'BeEp BoOp\n',
        meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        }
    });
    docs.b.push({
        hash: hashes[3],
        body: 'BEEPITY BOOPITY\n',
        meta: {
            key: 'blorp',
            prev: [
                { hash: hashes[1], key: 'blorp' },
                { hash: hashes[2], key: 'blorp' }
            ]
        }
    });
    t.plan((docs.a.length + docs.b.length) * 2);
    
    (function next () {
        if (docs.a.length === 0) return;
        var doc = docs.a.shift();
        var w = fdb.a.createWriteStream(doc.meta, function (err, hash) {
            t.ifError(err);
            t.equal(doc.hash, hash);
            next();
        });
        w.end(doc.body);
    })();
    
    (function next () {
        if (docs.b.length === 0) return;
        var doc = docs.b.shift();
        var w = fdb.b.createWriteStream(doc.meta, function (err, hash) {
            t.ifError(err);
            t.equal(doc.hash, hash);
            next();
        });
        w.end(doc.body);
    })();
});

test('replicating', function (t) {
    t.plan(4);
    var ra = fdb.a.replicate(function (err, hs) {
        t.ifError(err);
        t.deepEqual(hs.sort(), [ hashes[2], hashes[3], hashes[1] ].sort());
    });
    var rb = fdb.b.replicate(function (err, hs) {
        t.ifError(err);
        t.deepEqual(hs.sort(), [ hashes[0] ].sort());
    });
    ra.pipe(rb).pipe(ra);
});

test('replicate verify', function (t) {
    t.plan(20);
    
    var expected = {};
    expected.heads = [ { hash: hashes[3], key: 'blorp' } ];
    expected.tails = [ { hash: hashes[0], key: 'blorp' } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } },
        { hash: hashes[2], meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } },
        { hash: hashes[3], meta: {
            key: 'blorp',
            prev: [
                { hash: hashes[1], key: 'blorp' },
                { hash: hashes[2], key: 'blorp' }
            ]
        } }
    ];
    expected.links = {};
    expected.links[hashes[0]] = [
        { key: 'blorp', hash: hashes[1] },
        { key: 'blorp', hash: hashes[2] }
    ];
    expected.links[hashes[1]] = [
        { key: 'blorp', hash: hashes[3] }
    ];
    expected.links[hashes[2]] = [
        { key: 'blorp', hash: hashes[3] }
    ];
    
    check(t, fdb.a, expected);
    check(t, fdb.b, expected);
    
    fdb.a.createReadStream(hashes[0]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'beep boop\n');
    }));
    fdb.a.createReadStream(hashes[1]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BEEP BOOP\n');
    }));
    fdb.a.createReadStream(hashes[2]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BeEp BoOp\n');
    }));
    fdb.a.createReadStream(hashes[3]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BEEPITY BOOPITY\n');
    }));
    
    fdb.b.createReadStream(hashes[0]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'beep boop\n');
    }));
    fdb.b.createReadStream(hashes[1]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BEEP BOOP\n');
    }));
    fdb.b.createReadStream(hashes[2]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BeEp BoOp\n');
    }));
    fdb.b.createReadStream(hashes[3]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BEEPITY BOOPITY\n');
    }));
});

function collect (cb) {
    var rows = [];
    return through.obj(write, end);
    function write (row, enc, next) { rows.push(row); next() }
    function end () { cb(rows) }
}

function check (t, fdb, expected) {
    fdb.heads().pipe(collect(function (rows) {
        t.deepEqual(rows, sort(expected.heads), 'heads');
    }));
    fdb.tails().pipe(collect(function (rows) {
        t.deepEqual(rows, sort(expected.tails), 'tails');
    }));
    Object.keys(expected.links).forEach(function (hash) {
        fdb.links(hash).pipe(collect(function (rows) {
            t.deepEqual(rows, sort(expected.links[hash]), 'links');
        }));
    });
    fdb.list().pipe(collect(function (rows) {
        t.deepEqual(rows, sort(expected.list), 'list');
    }));
}

function sort (xs) {
    return xs.sort(cmp);
    function cmp (a, b) {
        if (a.hash !== undefined && a.hash < b.hash) return -1;
        if (a.hash !== undefined && a.hash > b.hash) return 1;
    }
}
