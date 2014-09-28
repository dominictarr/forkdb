var db = require('level')('/tmp/edit.db');
var fdb = require('../')(db, { dir: '/tmp/edit.blob' });

var hash = process.argv[2];
show(fdb.history(hash), 0);

function show (h, depth) {
    var indent = Array(depth+1).join(' ');
    var times = 0;
    
    h.on('data', function (row) {
        console.log(
            indent + (times++ === 0 ? '+- ' : '|- ')
            + row.meta.key + ' :: ' + row.hash
        );
    });
    h.on('branch', function (b) {
        show(b, depth + 1);
    });
}
