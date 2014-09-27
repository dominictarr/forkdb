# forkdb

store a history of simultaneous edits to blobs on top of leveldb

Conflicts are unavoidable, particularly when latency is high. Instead of hiding
that fundamental fact, interfaces should be honest about the underlying data
model and embrace conflicts.

# data model

There are keys that map to values like a normal key/value store, but each key
maps to an array of heads:

```
key = A,  heads = [ d, e, f ]
```

Each of these heads points back in time to the id of the content it was based
on:

```
d    e    f

|    |    |
v    v    v

g <- h    i

|
v

j
```

Multiple nodes may also come back together in a merge:

```
a    b ---.
          |
|    |    |
v    v    v

d    e    f

|    |    |
v    v    v

g <- h    i

|
v

j
```

More than 2 nodes can be merged at a time.


