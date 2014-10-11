# forkdb

forking content-addressed append-only historical key/value blob store over
leveldb

Conflicts are unavoidable, particularly when latency is high. Instead of hiding
that fundamental fact or going into a conflict panic mode that demands an
immediate resolution, forkdb anticipates and welcomes conflicts.

Interfaces built on forkdb should be honest about the underlying data model and
embrace conflicts too.

[![build status](https://secure.travis-ci.org/substack/forkdb.png)](http://travis-ci.org/substack/forkdb)

# example

Here we'll create a new document with the contents `beep boop` under the key
`"blorp"`.

```
$ echo beep boop | forkdb create --key=blorp
9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0
```

This document is now the singular head of the blorp key:

```
$ forkdb heads blorp
{"hash":"9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0","key":"blorp"}
```

But now, we'll make a new document that links back to the document we just
created and see that the head has updated to the new document's hash:

```
$ echo BEEP BOOP | forkdb create --key=blorp --prev [ --hash=9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0 --key=blorp ]
fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99
```

```
$ forkdb heads
{"hash":"fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99","key":"blorp"}
```

But suppose that while we were making our `BEEP BOOP` update, somebody else was
working on an edit to the same previous hash, 9c056451. In other words, a
conflict!

```
$ echo BeEp BoOp | forkdb create --key=blorp --prev [ --hash=9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0 --key=blorp ]
c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc
```

This is no problem for forkdb. There are just 2 heads now, which is completely
fine:

```
$ forkdb heads
{"hash":"c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc","key":"blorp"}
{"hash":"fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99","key":"blorp"}
```

A UI could show both (or more!) versions side by side or perhaps have a
branch where the files diverge.

However, we can also merge these 2 documents back into 1 by creating a new
document that points back and both heads:

```
$ echo BEEPITY BOOPITY | forkdb create --key=blorp --prev [ --hash=fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99 --key=blorp ] --prev [ --hash=c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc --key=blorp ]
e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d
```

and now we're back to a single head:

```
$ forkdb heads blorp
{"hash":"e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d","key":"blorp"}
```

However, all of the previous states of the blorp key were saved into the
history, which we can inspect by picking a key (in this case, the new head
e3bd9d14) and traversing back through the branches to end up at the tail:

```
$ forkdb history e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d
+- blorp :: e3bd9d14b8c298e57dbbb10235306bd46d12ebaeccd067dc9cdf7ed25b10a96d
 +- blorp :: fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99
 |- blorp :: 9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0
 +- blorp :: c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc
 |- blorp :: 9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0
```

## replication

First, we'll populate two databases, `/tmp/a` and `/tmp/b` with some data:

```
$ echo beep boop | forkdb -d /tmp/a create --key=msg
0673a2977261a9413b8a1abe8389b7c6ef327b319f60f814dece9617d43465c0
$ echo RAWR | forkdb -d /tmp/a create --key=msg --prev.hash=0673a2977261a9413b8a1abe8389b7c6ef327b319f60f814dece9617d43465c0 --prev.key=msg
d5c4f37b7dc7731f38a180edf714cd3ce1ce3e641fcf13b95ca470bf55a1833e
$ echo mooo | forkdb -d /tmp/b create --key=msg --prev.hash=0673a2977261a9413b8a1abe8389b7c6ef327b319f60f814dece9617d43465c0 --prev.key=msg
530ef19f9f7ed4d2a01bf2e3eba53da2cb1959eb0af5ef52adb10223826b0760
```

Now we can use [dupsh](https://npmjs.org/package/dupsh) to pipe replication
endpoints for `/tmp/a` and `/tmp/b` together:

```
$ dupsh 'forkdb sync -d /tmp/a' 'forkdb sync -d /tmp/b'
```

dupsh is handy here because the `sync` command reads from stdin and writes to
stdout. You can sync two forkdbs over the network with any duplex transport.

For example, with netcat we can create a server on port 5000:

```
$ dupsh 'forkdb sync -d /tmp/a' 'nc -l 5000'
```

and then elsewhere we can connect to port 5000 for replication:

```
$ dupsh 'forkdb sync -d /tmp/b' 'nc localhost 5000'
```

## api example

Create a forkdb instance by passing in a leveldown or levelup handle and a path
to where the blobs should go. Then you can use `createWriteStream(meta)` to
save some data:

``` js
var db = require('level')('/tmp/edit.db');
var fdb = require('forkdb')(db, { dir: '/tmp/edit.blob' });

var meta = JSON.parse(process.argv[2]);

var w = fdb.createWriteStream(meta, function (err, id) {
    if (err) console.error(err)
    else console.log(id)
});
process.stdin.pipe(w);
```

Now give the program some data on `stdin`:

```
$ echo beep boop | node create.js '{"key":"blorp"}'
9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0
```

# data model

The data model is append-only. Each document operates under a key and may
reference zero or more other documents by the hash of their content, which
always point backward in time. That is, to have a link to a document, the
document must first exist because the link is the hash of its content.

Each document can link back to zero, one, or many other documents from any other
key. You can make these links mean semantically whatever you wish, but given how
heads, tails, and forward indexes are generated from these backward links, this
is a helpful semantic model to use:

* `n = 0` - a new document with no history
* `n = 1` - an update to an existing document
* `n >= 2` - merge multiple documents together

For each of these conditions, the heads and tails are updated:

* `n = 0` - a new head and new tail are added
* `n = 1` - a head is removed, a new head is added
* `n >= 2` - `n` heads are removed, one head is added

Each update with a backward link also generates a forward link to enable fast
forward and backward traversals. Forward links, heads, and tails are all
generated purely for performance reasons since these can all be computed, albeit
slowly, from the backward links.

# methods

``` js
var forkdb = require('forkdb')
```

## var fdb = forkdb(db, opts)

Create a new forkdb instance `fdb` from a levelup or leveldown `db`.

Optionally set:

* `opts.dir` - directory to use for blob storage, default: './forkdb.blob'
* `opts.store` - content-addressable [abstract-blob-store](https://npmjs.org/package/abstract-blob-store) to use instead of
[content-addressable-blob-store](https://npmjs.org/package/content-addressable-blob-store)
* `opts.prebatch(rows, key, cb)` - function that gets run before db.batch() is
called. Should call `cb(err, rows)` with the new array of rows to insert or an
error.

To run both the command-line tool and the api over the same data simultaneously,
use [level-party](https://npmjs.org/package/level-party) to create the `db`.

## var w = fdb.createWriteStream(meta, opts={}, cb)

Save the data written to the writable stream `w` into blob storage at
`meta.key`. To link back to previous documents, specify an array of objects with
`key` and `hash` properties as `meta.prev`. For example:

``` js
meta.key = 'blorp';
meta.prev = [
  { key: 'blorp', hash: 'fcbcbe4389433dd9652d279bb9044b8e570d7f033fab18189991354228a43e99' },
  { key: 'blorp', hash: 'c3122c908bf03bb8b36eaf3b46e27437e23827e6a341439974d5d38fb22fbdfc' }
];
```

`cb(err, key)` fires when an error occurs or when all the data has been written
successfully to blob storage and leveldb under the key `key`.

Optionally, you can set an `opts.prebatch(row, key)` function that masks the
prebatch function declared in the constructor.

## var r = fdb.heads(key)

Return a readable object stream `r` that outputs an object with `key` and `hash`
properties for every head of `key`.

If `key` is undefined, all heads from all the keys are output.

## var r = fdb.tails(key)

Return a readable object stream `r` that outputs an object with `key` and `hash`
properties for every tail of `key`.

If `key` is undefined, all tails from all the keys are output.

## var r = fdb.list(opts)

Return a readable object stream `r` that outputs each metadata object for every
document in the database.

Constrain the output stream by passing in `opts.gt`, `opts.lt`, or `opts.limit`.

## var r = fdb.keys(opts)

Return a readable object stream `r` that outputs a record for every key in the
database.

Constrain the output stream by passing in `opts.gt`, `opts.lt`, or `opts.limit`.

## var r = fdb.get(hash)

Return a readable stream `r` with the blob content at `hash`.

## fdb.getMeta(hash, cb) 

Get the metadata for `hash` and call `cb(err, meta)` with the result.

## var r = fdb.getLinks(hash)

Return a readable object stream `r` that outputs an object with `key` and `hash`
properties for every forward link of `hash`.

## var r = fdb.history(hash)

Return a readable object stream `r` that traverses backward starting from
`hash`, outputting a metadata object for each document in the history.

When the traversal comes to a branch, `r` ends and emits a `'branch'` event with
a `b` object for each branch. The branch object `b` has the same behavior as `r`
and operates recursively.

## var r = fdb.future(hash)

Return a readable object stream `r` that traverses forward starting from `hash`,
outputting a metadata object for each document in the future history.

When the traversal comes to a branch, `r` ends and emits a `'branch'` event with
a `b` object for each branch. The branch object `b` has the same behavior as `r`
and operates recursively.

## var d = fdb.replicate(opts={}, cb)

Return a duplex stream `d` to replicate with another forkdb.
Pipe the endpoints to each other, duplex stream style:

```
var d = fdb.replicate();
d.pipe(stream).pipe(d);
```

for some full-duplex `stream`, for example from a tcp connection.

Specify the replication strategy with `opts.mode`:

* `opts.mode === 'sync'` - multi-master replication (default strategy)
* `opts.mode === 'push'` - only send updates
* `opts.mode === 'pull'` - only receive updates

Note that if both endpoints try to push or both endpoints try to pull from each
other, nothing will happen.

# usage

```
usage: forkdb COMMAND OPTIONS

  Global options are:

    -d, --dir  directory to use for both db and blob storage
               If not specified, uses $FORKDB_DIR or ./forkdb
 
    --blobdir  directory to use for blob storage

    --dbdir    directory to use for db

forkdb create --key=KEY --prev [ --key=... --hash=... ] ...

  Create a new document with content from stdin under KEY.
  Set pointers to previous content with a "prev" key in json or with
  `--prev [ ... ]` subarg syntax.
  
  Omit `--prev` if there are no pointers.

forkdb list {--lt=LT, --gt=GT, --limit=LIMIT}

  List all the document metadata in the database.
  Optionally set LT, GT, and LIMIT constraints on the output.

forkdb get HASH

  Print the contents for HASH to stdout.

forkdb meta HASH

  Print the metadata for HASH to stdout as json.

forkdb heads KEY

  Print newline-delimited json of metadata to stdout for every head of KEY.

forkdb tails KEY

  Print newline-delimited json of metadata to stdout for every tail of KEY.

forkdb links HASH

  Print newline-delimited json for the `key` and `hash` properties of each
  forward link back to HASH.

forkdb history HASH

  Print an ascii diagram to stdout tracing HASH back in time to its tails.

forkdb future

  Print an ascii diagram to stdout tracing HASH forward in time to its heads.

forkdb help

  Show this message.

```

# install

With [npm](https://npmjs.org),
to get the `forkdb` command do:

```
npm install -g forkdb
```

and to get the library do:

```
npm install forkdb
```

# license

MIT
