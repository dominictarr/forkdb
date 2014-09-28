var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db);

var key = process.argv[2];
fdb.heads(key).on('data', console.log);
