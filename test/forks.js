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
    'fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99',
    'c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc',
    'e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d'
];

test('first doc', function (t) {
    t.plan(6);
    
    var expected = {};
    expected.heads = [ { hash: hashes[0], key: 'blorp' } ];
    expected.tails = [ { hash: hashes[0], key: 'blorp' } ];
    expected.list = [ { hash: hashes[0], meta: { key: 'blorp' } } ];
    expected.links = {};
    
    var w = fdb.createWriteStream({ key: 'blorp' }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[0]);
        check(t, fdb, expected);
        fdb.get(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
    }
    w.end('beep boop\n');
});

test('second doc', function (t) {
    t.plan(8);
    
    var expected = {};
    expected.heads = [ { hash: hashes[1], key: 'blorp' } ];
    expected.tails = [ { hash: hashes[0], key: 'blorp' } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } }
    ];
    expected.links = {};
    expected.links[hashes[0]] = [ { key: 'blorp', hash: hashes[1] } ];
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [ { hash: hashes[0], key: 'blorp' } ]
    }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[1]);
        check(t, fdb, expected);
        fdb.get(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
        fdb.get(hashes[1]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BEEP BOOP\n');
        }));
    }
    w.end('BEEP BOOP\n');
});

test('third doc (conflict)', function (t) {
    t.plan(9);
    
    var expected = {};
    expected.heads = [
        { hash: hashes[2], key: 'blorp' },
        { hash: hashes[1], key: 'blorp' }
    ];
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
        } }
    ];
    expected.links = {};
    expected.links[hashes[0]] = [
        { key: 'blorp', hash: hashes[2] },
        { key: 'blorp', hash: hashes[1] }
    ];
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [ { hash: hashes[0], key: 'blorp' } ]
    }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[2]);
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
    }
    w.end('BeEp BoOp\n');
});

test('fourth doc (merge)', function (t) {
    t.plan(12);
    
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
                { hash: hashes[2], key: 'blorp' },
                { hash: hashes[1], key: 'blorp' }
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
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [
            { hash: hashes[1], key: 'blorp' },
            { hash: hashes[2], key: 'blorp' }
        ]
    }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[3]);
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
    }
    w.end('BEEPITY BOOPITY\n');
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
        fdb.getLinks(hash).pipe(collect(function (rows) {
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
        if (a.hash !== undefined && a.hash === b.hash) return 0;
        if (a.key !== undefined && a.key < b.key) return -1;
        if (a.key !== undefined && a.key > b.key) return 1;
        if (a.key !== undefined && a.key === b.key) return 0;
    }
}
