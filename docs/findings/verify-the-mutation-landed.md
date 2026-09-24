# Verify the mutation landed before trusting its result

**A mutation that did not land produces the same green as a mutation the
script missed.** Both print `PASS` and exit 0. Nothing in the output
distinguishes "the guard caught nothing because there was nothing to catch"
from "the guard is blind".

## The instance

Confirming the withdrawal-id hole meant deleting one of §26's two
self-withdrawal marks and watching the script still pass. The deletion was
written as a `String.replace` of a section's HTML back into the whole file.
It silently failed to match. The script printed ten `PASS` lines and exit 0,
and that was reported as the hole reproducing.

It was not. The file was byte-identical to the original — `cmp` against a
pristine copy said so. The run had verified the unmutated file, correctly.

The hole was real, and a later verified mutation proved it. But the evidence
offered for it at that moment was worthless, and it looked exactly like
evidence.

## Why this shape is easy to hit

A mutation is deliberately destructive, so it tends to be written as
throwaway code: a regex, a `replace`, a quick slice. All of those fail
*quietly* when the pattern misses. And the failure mode points the same
direction as the hypothesis — you expect a pass, you get a pass, and the
prediction confirms itself for the wrong reason.

`String.replace` on a large HTML fragment is a particularly good trap: the
needle can differ from the haystack by an entity, an attribute order or a
whitespace run, and the result is not an error but the original string
returned unchanged.

## The rule

**Between mutating and running, assert the file changed.** Cheaply:

```
cp target pristine            # before
...mutate...
cmp -s target pristine && echo "DID NOT LAND"
```

Better, assert the specific change: the mark count dropped by one, the byte
count fell by the length of what was removed. The apply script now prints
`bytes removed: 65`, which cannot be produced by a replace that missed.

And restore from the pristine copy rather than by re-running an inverse
mutation, which can miss in exactly the same way.

## The generalisation

This is the [reachable-signal](./a-reachable-signal-is-not-the-claim.md)
pattern in the tooling that checks the tooling. The reachable signal is the
script's exit status; the claim is "the guard is blind to this deletion", and
that claim requires the deletion to exist. A mutation test has two premises,
and only one of them gets checked by running it.
