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
    'f5ff29843ef0658e2a1e14ed31198807ce8302936116545928756844be45fe41',
    '6c0c881fad7adb3fec52b75ab0de8670391ceb8847c8e4c3a2dce9a56244b328',
    '96b51029baa85e07be09a25ec568132f104eaa1f06db35c28e21767e9d5b9eb7'
];

test('first doc', function (t) {
    t.plan(6);
    
    var expected = {};
    expected.heads = [ { hash: hashes[0] } ];
    expected.tails = [ { hash: hashes[0] } ];
    expected.list = [ { hash: hashes[0], meta: { key: 'blorp' } } ];
    expected.links = {};
    
    var w = fdb.createWriteStream({ key: 'blorp' }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[0]);
        check(t, fdb, expected);
        fdb.createReadStream(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
    }
    w.end('beep boop\n');
});

test('second doc', function (t) {
    t.plan(8);
    
    var expected = {};
    expected.heads = [ { hash: hashes[1] } ];
    expected.tails = [ { hash: hashes[0] } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: [ hashes[0] ]
        } }
    ];
    expected.links = {};
    expected.links[hashes[0]] = [ { key: 'blorp', hash: hashes[1] } ];
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [ hashes[0] ]
    }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[1]);
        check(t, fdb, expected);
        fdb.createReadStream(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
        fdb.createReadStream(hashes[1]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BEEP BOOP\n');
        }));
    }
    w.end('BEEP BOOP\n');
});

test('third doc (conflict)', function (t) {
    t.plan(9);
    
    var expected = {};
    expected.heads = [
        { hash: hashes[2] },
        { hash: hashes[1] }
    ];
    expected.tails = [ { hash: hashes[0] } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: [ hashes[0] ]
        } },
        { hash: hashes[2], meta: {
            key: 'blorp',
            prev: [ hashes[0] ]
        } }
    ];
    expected.links = {};
    expected.links[hashes[0]] = [
        { key: 'blorp', hash: hashes[2] },
        { key: 'blorp', hash: hashes[1] }
    ];
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [ hashes[0] ]
    }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[2]);
        check(t, fdb, expected);
        fdb.createReadStream(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
        fdb.createReadStream(hashes[1]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BEEP BOOP\n');
        }));
        fdb.createReadStream(hashes[2]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BeEp BoOp\n');
        }));
    }
    w.end('BeEp BoOp\n');
});

test('fourth doc (merge)', function (t) {
    t.plan(12);
    
    var expected = {};
    expected.heads = [ { hash: hashes[3] } ];
    expected.tails = [ { hash: hashes[0] } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: [ hashes[0] ]
        } },
        { hash: hashes[2], meta: {
            key: 'blorp',
            prev: [ hashes[0] ]
        } },
        { hash: hashes[3], meta: {
            key: 'blorp',
            prev: [ hashes[1], hashes[2] ]
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
        prev: [ hashes[1], hashes[2] ]
    }, onfinish);
    function onfinish (err, key) {
        t.ifError(err);
        t.equal(key, hashes[3]);
        check(t, fdb, expected);
        fdb.createReadStream(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
        fdb.createReadStream(hashes[1]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BEEP BOOP\n');
        }));
        fdb.createReadStream(hashes[2]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BeEp BoOp\n');
        }));
        fdb.createReadStream(hashes[3]).pipe(concat(function (body) {
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
    fdb.heads('blorp').pipe(collect(function (rows) {
        t.deepEqual(rows, sort(expected.heads), 'heads');
    }));
    fdb.tails('blorp').pipe(collect(function (rows) {
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
