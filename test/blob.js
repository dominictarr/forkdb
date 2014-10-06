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

var blob = Array(1000 * 200 + 1).join('A');

test('blob', function (t) {
    t.plan(2);
    var w = fdb.createWriteStream({}, function (err, key) {
        t.ifError(err);
        fdb.get(key).pipe(concat(function (body) {
            t.equal(body.toString('utf8'), blob);
        }));
    });
    w.end(blob);
});
