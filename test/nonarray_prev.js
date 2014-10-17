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
var fdb = require('../')(db, { dir: path.join(tmpdir, 'blob') });

var hashes = [
    '9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0',
    '1ffcdc9a4e47ee447ec72f38744f1ddd6b200a86389895aa249c9fc49bc04289',
    'b705af981e52c0fbfe9845ac1ba6d2a4f75a4677f1b6264b3b358315afe8f202',
    '6d4aeea6772e7bfc715fb42d0679f3bf2ffab77afc50588fd0264694d11ebf51'
];

test('populate non-array prev', function (t) {
    var docs = [
        { hash: hashes[0], body: 'beep boop\n', meta: { key: 'blorp' } },
        { hash: hashes[1], body: 'BEEP BOOP\n', meta: {
            key: 'blorp',
            prev: { hash: hashes[0], key: 'blorp' }
        } },
        { hash: hashes[2], body: 'BeEp BoOp\n', meta: {
            key: 'blorp',
            prev: { hash: hashes[0], key: 'blorp' }
        } },
        { hash: hashes[3], body: 'BEEPITY BOOPITY\n', meta: {
            key: 'blorp',
            prev: [
                { hash: hashes[1], key: 'blorp' },
                { hash: hashes[2], key: 'blorp' }
            ]
        } }
    ];
    t.plan(docs.length * 2);
    
    (function next () {
        if (docs.length === 0) return;
        var doc = docs.shift();
        var w = fdb.createWriteStream(doc.meta, function (err, hash) {
            t.ifError(err);
            t.equal(hash, doc.hash);
            next();
        });
        w.end(doc.body);
    })();
});

test('in order', function (t) {
    t.plan(10);
    
    var expected = {};
    expected.heads = [ { hash: hashes[3], key: 'blorp' } ];
    expected.tails = [ { hash: hashes[0], key: 'blorp' } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: { hash: hashes[0], key: 'blorp' }
        } },
        { hash: hashes[2], meta: {
            key: 'blorp',
            prev: { hash: hashes[0], key: 'blorp' }
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
    
    check(t, fdb, expected);
    fdb.get(hashes[0]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'beep boop\n');
    }));
    fdb.get(hashes[1]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BEEP BOOP\n');
    }));
    fdb.get(hashes[2]).pipe(concat(function (body) {
        t.equal(body.toString('utf8'), 'BeEp BoOp\n');
    }));
    fdb.get(hashes[3]).pipe(concat(function (body) {
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
