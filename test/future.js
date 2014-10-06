var test = require('tape');
var path = require('path');
var level = require('level');
var mkdirp = require('mkdirp');
var through = require('through2');
var concat = require('concat-stream');

var tmpdir = path.join(
    require('osenv').tmpdir(),
    'forkdb-test-' + Math.random()
);
mkdirp.sync(tmpdir);

var db = level(path.join(tmpdir, 'db'));

var hashes = [
    '9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0',
    'fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99',
    'c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc',
    'e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d'
];

var forkdb = require('../');
var fdb = forkdb(db, { dir: path.join(tmpdir, 'blob') });

test('populate future', function (t) {
    var docs = [
        { hash: hashes[1], body: 'BEEP BOOP\n', meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } },
        { hash: hashes[3], body: 'BEEPITY BOOPITY\n', meta: {
            key: 'blorp',
            prev: [
                { hash: hashes[1], key: 'blorp' },
                { hash: hashes[2], key: 'blorp' }
            ]
        } },
        { hash: hashes[2], body: 'BeEp BoOp\n', meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } },
        { hash: hashes[0], body: 'beep boop\n', meta: { key: 'blorp' } },
    ];
    t.plan(docs.length * 2);
    
    (function next () {
        if (docs.length === 0) return;
        var doc = docs.shift();
        var w = fdb.createWriteStream(doc.meta, function (err, hash) {
            t.ifError(err);
            t.equal(doc.hash, hash);
            next();
        });
        w.end(doc.body);
    })();
});

test('future', function (t) {
    t.plan(6);
    
    var h0 = fdb.future(hashes[0]);
    h0.pipe(collect(function (rows) {
        t.deepEqual(mhashes(rows), [ hashes[0] ], 'future 0');
    }));
    var ex0 = [
        [ hashes[2], hashes[3] ],
        [ hashes[1], hashes[3] ]
    ];
    h0.on('branch', function (b) {
        var ex = ex0.shift();
        b.pipe(collect(function (rows) {
            t.deepEqual(mhashes(rows), ex, 'future 0 branch');
        }));
    });
    
    fdb.future(hashes[1]).pipe(collect(function (rows) {
        t.deepEqual(mhashes(rows), [ hashes[1], hashes[3] ], 'future 1');
    }));
    fdb.future(hashes[2]).pipe(collect(function (rows) {
        t.deepEqual(mhashes(rows), [ hashes[2], hashes[3] ], 'future 2');
    }));
    fdb.future(hashes[3]).pipe(collect(function (rows) {
        t.deepEqual(mhashes(rows), [ hashes[3] ], 'future 3');
    }));
});

function collect (cb) {
    var rows = [];
    return through.obj(write, end);
    function write (row, enc, next) { rows.push(row); next() }
    function end () { cb(rows) }
}

function mhashes (rows) {
    return rows.map(function (row) { return row.hash });
}
