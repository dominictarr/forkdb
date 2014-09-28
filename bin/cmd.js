#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var defined = require('defined');

var argv = require('subarg')(process.argv.slice(2), {
    alias: { d: 'dir', h: 'help' },
    default: { dir: defined(process.env.FORKDB_DIR, './forkdb') }
});
if (argv.help) return showHelp(0);

var through = require('through2');
var stringify = require('json-stable-stringify');
var mkdirp = require('mkdirp');

var dbdir = argv.dbdir;
var blobdir = argv.blobdir;
if (dbdir === undefined) dbdir = path.join(argv.dir, 'db');
if (blobdir === undefined) blobdir = path.join(argv.dir, 'blob');

mkdirp.sync(dbdir);
mkdirp.sync(blobdir);

var db = require('level-party')(dbdir);
var fdb = require('../')(db, { dir: blobdir });

var cmd = argv._[0];

if (cmd === 'list') {
    fdb.list().pipe(ndjson()).pipe(process.stdout);
}
else if (cmd === 'create') {
    var meta = {};
    if (argv._[1] !== undefined) meta = JSON.parse(argv._[1]);
    
    if (argv.key) meta.key = argv.key;
    if (argv.prev) meta.prev = argv.prev;
    
    var w = fdb.createWriteStream(meta, function (err, id) {
        if (err) error(err)
        else console.log(id)
    });
    process.stdin.pipe(w);
}
else if (cmd === 'get') {
    if (argv._.length < 2) return showHelp(1);
    fdb.get(argv._[1]).pipe(process.stdout);
}
else if (cmd === 'meta') {
    if (argv._.length < 2) return showHelp(1);
    fdb.getMeta(argv._[1], function (err, row) {
        if (err) error(err)
        else console.log(stringify({ space: 2 }));
    });
}
else if (cmd === 'heads') {
    fdb.heads(key).pipe(ndjson()).pipe(process.stdout);
}
else if (cmd === 'tails') {
    fdb.tails(key).pipe(ndjson()).pipe(process.stdout);
}
else if (cmd === 'history') {
    if (argv._.length < 2) return showHelp(1);
    showHistory(fdb, argv._[1]);
}
else if (cmd === 'links') {
    if (argv._.length < 2) return showHelp(1);
    fdb.getLinks(argv._[1]).pipe(ndjson()).pipe(process.stdout);
}
else if (cmd === 'future') {
    // todo
}
else showHelp(1);

function showHelp (code) {
    var r = fs.createReadStream(path.join(__dirname, 'usage.txt'));
    r.on('end', function () {
        if (code) process.exit(code);
    });
    r.pipe(process.stdout);
}

function error (err) {
    console.error(err);
    process.exit(1);
}

function ndjson () {
    return through(function (row, enc, next) {
        this.push(stringify(row) + '\n');
        next();
    });
}
