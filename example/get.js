var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });

var hash = process.argv[2];
fdb.meta(hash, function (err, ref) {
    if (err) console.error(err)
    else console.log(ref)
});
