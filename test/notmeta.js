var test = require('tape');
var path = require('path');
var level = require('level');
var mkdirp = require('mkdirp');
var concat = require('concat-stream');

var tmpdir = path.join(
    require('osenv').tmpdir(),
    'forkdb-test-' + Math.random()
);
mkdirp.sync(tmpdir);

var db = level(path.join(tmpdir, 'db'));
var forkdb = require('../');
var fdb = forkdb(db, { dir: path.join(tmpdir, 'blob') });

var blob = Array(1000 * 20 + 1).join('A');

test('fnmeta', function (t) {
    t.plan(3);
    var w = fdb.createWriteStream(function (err, key) {
        t.ifError(err);
        fdb.get(key, function (err, res) {
            t.ifError(err);
            t.deepEqual(res, {});
        });
    });
    w.end(blob);
});

test('notmeta', function (t) {
    t.plan(3);
    var w = fdb.createWriteStream(null, function (err, key) {
        t.ifError(err);
        fdb.get(key, function (err, res) {
            t.ifError(err);
            t.deepEqual(res, {});
        });
    });
    w.end(blob);
});
