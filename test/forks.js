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

test('first doc', function (t) {
    var hashes = [
        '9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0'
    ];
    var expected = {};
    expected.heads = [ { hash: hashes[0], key: 'blorp' } ];
    expected.tails = expected.heads.slice();
    expected.list = [ { hash: hashes[0], meta: { key: 'blorp' } } ];
    expected.links = [];
    t.plan(5);
    
    var w = fdb.createWriteStream({ key: 'blorp' });
    w.on('finish', function () {
        check(t, fdb, expected);
        fdb.get(hashes[0]).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), 'beep boop\n');
        }));
    });
    w.end('beep boop\n');
});

function collect (cb) {
    var rows = [];
    return through.obj(write, end);
    function write (row, enc, next) { rows.push(row); next() }
    function end () { cb(rows) }
}

function check (t, fdb, expected) {
    fdb.heads().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.heads);
    }));
    fdb.tails().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.heads);
    }));
    fdb.getLinks().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.links);
    }));
    fdb.list().pipe(collect(function (rows) {
        t.deepEqual(rows, expected.list);
    }));
}
