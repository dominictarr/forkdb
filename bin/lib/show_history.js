module.exports = function (fdb, hash, cb) {
    var stack = [];
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
        h.on('end', function () {
            if (stack.length) stack.shift()();
            else if (cb) cb();
        });
        
        h.on('branch', function (b) {
            stack.push(function () { show(b, depth + 1) });
        });
    }
};
