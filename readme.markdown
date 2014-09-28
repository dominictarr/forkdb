# forkdb

forking content-addressed append-only historical key/value blob store over
leveldb

Conflicts are unavoidable, particularly when latency is high. Instead of hiding
that fundamental fact or going into a conflict panic mode that demands an
immediate resolution, forkdb anticipates and welcomes conflicts.

Interfaces built on forkdb should be honest about the underlying data model and
embrace conflicts too.

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
3762e2b940fe628e7cb90895c7c1614e227e5f13ef3a1346927da06e019d833c
```

```
$ forkdb heads
{"hash":"3762e2b940fe628e7cb90895c7c1614e227e5f13ef3a1346927da06e019d833c","key":"blorp"}
```

But suppose that while we were making our `BEEP BOOP` update, somebody else was
working on an edit to the same previous hash, 9c056451. In other words, a
conflict!

```
$ echo BeEp BoOp | forkdb create --key=blorp --prev [ --hash=9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0 --key=blorp ]
d7b88783f8c52bfc370cddcea600c6328ba7ca3251a669c82e71a1c0ca73f0ba
```

This is no problem for forkdb. There are just 2 heads now, which is completely
fine:

```
{"hash":"3762e2b940fe628e7cb90895c7c1614e227e5f13ef3a1346927da06e019d833c","key":"blorp"}
{"hash":"d7b88783f8c52bfc370cddcea600c6328ba7ca3251a669c82e71a1c0ca73f0ba","key":"blorp"}
```

A UI could show both (or more!) versions side by side or perhaps have a
branch where the files diverge.

However, we can also merge these 2 documents back into 1 by creating a new
document that points back and both heads:

```
$ echo BEEPITY BOOPITY | forkdb create --key=blorp --prev [ --hash=3762e2b940fe628e7cb90895c7c1614e227e5f13ef3a1346927da06e019d833c --key=blorp ] --prev [ --hash=d7b88783f8c52bfc370cddcea600c6328ba7ca3251a669c82e71a1c0ca73f0ba --key=blorp ]
e9f292a310cea3d53ff05624e4ab50251d03250eef51a3607320d13af17971c4
```

and now we're back to a single head:

```
$ forkdb heads blorp
{"hash":"e9f292a310cea3d53ff05624e4ab50251d03250eef51a3607320d13af17971c4","key":"blorp"}
```

However, all of the previous states of the blorp key were saved into the
history, which we can inspect by picking a key (in this case, the new head
e9f292a3) and traversing back through the branches to end up at the tail:

```
$ forkdb history e9f292a310cea3d53ff05624e4ab50251d03250eef51a3607320d13af17971c4
+- blorp :: e9f292a310cea3d53ff05624e4ab50251d03250eef51a3607320d13af17971c4
 +- blorp :: 3762e2b940fe628e7cb90895c7c1614e227e5f13ef3a1346927da06e019d833c
 |- blorp :: 9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0
 +- blorp :: d7b88783f8c52bfc370cddcea600c6328ba7ca3251a669c82e71a1c0ca73f0ba
 |- blorp :: 9c0564511643d3bc841d769e27b1f4e669a75695f2a2f6206bca967f298390a0
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

# usage

```
usage: forkdb COMMAND OPTIONS

  Global options are:

    -d, --dir  directory to use for both db and blob storage
               If not specified, uses $FORKDB_DIR or ./forkdb
 
    --blobdir  directory to use for blob storage

    --dbdir    directory to use for db

forkdb create '{"key":"...","prev":[...]}'
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

