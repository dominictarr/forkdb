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
    'c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc'
];

test('first doc', function (t) {
    var expected = {};
    expected.heads = [ { hash: hashes[0], key: 'blorp' } ];
    expected.tails = [ { hash: hashes[0], key: 'blorp' } ];
    expected.list = [ { hash: hashes[0], meta: { key: 'blorp' } } ];
    expected.links = {};
    t.plan(4);
    
    var w = fdb.createWriteStream({ key: 'blorp' });
    w.on('finish', function () {
        check(t, fdb, expected);
        fdb.get(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
    });
    w.end('beep boop\n');
});

test('second doc', function (t) {
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
    t.plan(6);
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [ { hash: hashes[0], key: 'blorp' } ]
    });
    w.on('finish', function () {
        check(t, fdb, expected);
        fdb.get(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
        fdb.get(hashes[1]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BEEP BOOP\n');
        }));
    });
    w.end('BEEP BOOP\n');
});

test('third doc (conflict)', function (t) {
    var expected = {};
    expected.heads = [
        { hash: hashes[2], key: 'blorp' },
        { hash: hashes[1], key: 'blorp' }
    ];
    expected.tails = [ { hash: hashes[0], key: 'blorp' } ];
    expected.list = [
        { hash: hashes[0], meta: { key: 'blorp' } },
        { hash: hashes[2], meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } },
        { hash: hashes[1], meta: {
            key: 'blorp',
            prev: [ { hash: hashes[0], key: 'blorp' } ]
        } }
    ];
    expected.links = {};
    expected.links[hashes[0]] = [
        { key: 'blorp', hash: hashes[2] },
        { key: 'blorp', hash: hashes[1] }
    ];
    t.plan(6);
    
    var w = fdb.createWriteStream({
        key: 'blorp',
        prev: [ { hash: hashes[0], key: 'blorp' } ]
    });
    w.on('finish', function () {
        check(t, fdb, expected);
        fdb.get(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
        fdb.get(hashes[1]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'BEEP BOOP\n');
        }));
    });
    w.end('BeEp BoOp\n');
});

function collect (cb) {
    var rows = [];
    return through.obj(write, end);
    function write (row, enc, next) { rows.push(row); next() }
    function end () { cb(rows) }
}

function check (t, fdb, expected) {
    fdb.heads().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.heads, 'heads');
    }));
    fdb.tails().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.tails, 'tails');
    }));
    Object.keys(expected.links).forEach(function (hash) {
        fdb.getLinks(hash).pipe(collect(function (rows) {
            t.deepEqual(rows, expected.links[hash], 'links');
        }));
    });
    fdb.list().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.list, 'list');
    }));
}
