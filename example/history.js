var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });

var hash = process.argv[2];
show(fdb.history(hash));

function show (h) {
    h.on('data', console.log);
    h.on('branch', show);
}
