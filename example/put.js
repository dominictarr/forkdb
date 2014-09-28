var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });
var meta = require('subarg')(process.argv.slice(2));

var w = fdb.createWriteStream(meta, function (err, id) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else console.log(id);
});
process.stdin.pipe(w);
