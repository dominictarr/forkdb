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

test('populate push pull', function (t) {
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

test('push pull', function (t) {
    t.plan(2);
    var ra = fdb.a.replicate({ mode: 'push' }, function (err, hs) {
        t.ifError(err);
    });
    var rb = fdb.b.replicate({ mode: 'pull' }, function (err, hs) {
        t.ifError(err);
    });
    ra.pipe(rb).pipe(ra);
});

test('push pull verify', function (t) {
    t.plan(8);
    
    fdb.a.heads('blorp', function (err, hs) {
        t.ifError(err);
        t.deepEqual(hs, [ { hash: hashes[2] } ], 'heads a');
    });
    
    fdb.a.list(function (err, hs) {
        t.ifError(err);
        t.deepEqual(
            mhashes(hs).sort(),
            [ hashes[0], hashes[2] ].sort(),
            'list a'
        );
    });
    
    fdb.b.heads('blorp', function (err, hs) {
        t.ifError(err);
        t.deepEqual(hs, [ { hash: hashes[3] } ], 'heads b');
    });
    
    fdb.b.list(function (err, hs) {
        t.ifError(err);
        t.deepEqual(
            mhashes(hs).sort(),
            [ hashes[0], hashes[1], hashes[2], hashes[3] ].sort(),
            'list b'
        );
    });
});

function mhashes (xs) { return xs.map(function (x) { return x.hash }) }
