# forkdb

forking content-addressed append-only historical key/value blob store over
leveldb

Conflicts are unavoidable, particularly when latency is high. Instead of hiding
that fundamental fact or going into conflict panic mode (like couchdb does),
forkdb anticipates and welcomes conflicts.

Interfaces built on forkdb should be honest about the underlying data model and
embrace conflicts too.

# example

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

