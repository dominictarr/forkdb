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
var forkdb = require('../');

test('prebatch invalid', function (t) {
    var fdb = forkdb(db, {
        dir: path.join(tmpdir, 'blob'),
        prebatch: function (rows) { return 'yo' }
    });
    
    t.plan(1);
    var w = fdb.createWriteStream({}, function (err, hash) {
        t.ok(err);
    });
    w.end('ABC');
});
