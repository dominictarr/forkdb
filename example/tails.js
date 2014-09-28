var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });

var key = process.argv[2];
fdb.tails(key).on('data', console.log);
