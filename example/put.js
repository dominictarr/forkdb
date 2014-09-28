var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db);
var argv = require('minimist')(process.argv.slice(2));

var key = argv._[0];
var w = fdb.createWriteStream(key, argv.meta, function (err, id) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else console.log(id);
});
process.stdin.pipe(w);
