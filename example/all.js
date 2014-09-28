var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });

fdb.list().on('data', console.log);
