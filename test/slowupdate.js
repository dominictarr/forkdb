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

test('slow update prev', function (t) {
    t.plan(3);
    var up = fdb._updatePrev;
    fdb._updatePrev = function () {
        var c = this, args = arguments;
        setTimeout(function () {
            up.apply(c, args);
        }, 200);
    };
    var meta = {
        prev: [ {
            hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            meta: {}
        } ]
    };
    var w = fdb.createWriteStream(meta, function (err, key) {
        t.ifError(err);
        fdb.get(key, function (err, res) {
            t.ifError(err);
            t.deepEqual(res, meta);
        });
    });
    w.end(blob);
});
