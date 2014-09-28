var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });

var hash = process.argv[2];
fdb.getLinks(hash).on('data', console.log);
