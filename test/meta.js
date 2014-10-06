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

test('meta', function (t) {
    t.plan(3);
    var w = fdb.createWriteStream({ x: 555 }, function (err, key) {
        t.ifError(err);
        fdb.getMeta(key, function (err, res) {
            t.ifError(err);
            t.deepEqual(res, { x: 555 });
        });
    });
    w.end(blob);
});
