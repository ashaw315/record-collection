# Two writers, one file, whole-file replacement

**Finding for Design. The clearest argument this project has for why
`check-index.mjs` was worth building.**

## What happens

Design authors the build targets and ships them as whole files. This repo adds
a mechanical layer to the same files: `<span data-withdrawn-by="N">` wrappers
that declare which passages are withdrawn, plus small wording changes the
index assertions require.

**Design has never had that layer.** Every build target it has shipped —
checked across all of them — carries zero `data-withdrawn-by` marks. They
exist only in this repo's copy.

So every round, the sequence is:

1. Design edits its own copy and ships the whole file.
2. The file replaces this repo's copy.
3. **The mechanical layer is gone**, silently, as a side effect of the
   replacement.

Nobody did anything wrong at any step. There is no merge, no conflict, and
nothing to review.

## Why review cannot catch it

**The prose comes back byte-identical.** Measured on one such round: eleven
marks were stripped, and every affected line returned with exactly the same
text minus the `<span>` wrapper. A reviewer reading the diff sees a passage
removed and the same passage added. There is nothing in the *content* to
notice, because the content did not change.

Diff tools make it worse rather than better. A whole-file replacement of a
200KB HTML file produces a diff dominated by the edits Design actually made;
the stripped wrappers are scattered single-line changes among them, each of
which reads as a no-op.

## Why the script catches it immediately

Assertions 6 and 7 are the two directions of one check: every withdrawal the
reader's note lists must be marked in its section, and every mark must be
listed. **A stripped layer fails 6 on every entry at once** — eleven
simultaneous failures naming exactly which sections lost their marks:

    FAIL 6
    6 §13/§24   6 §13/§27   6 §17/§20   6 §19/§20
    6 §20/§22   6 §25/§26   6 §26/§26   6 §26/§31
    6 §23/§32   6 §30/§32   6 §18/§28

That pattern — *all* listed withdrawals failing, none marked — is
diagnostic. A genuine editorial change withdraws one passage and fails one
assertion. A stale-base replacement fails all of them.

**This is the case the spec's own note anticipates**: "The script's exit code
is the result. A report written by whoever edited the index is not." Nobody
who edited these files could have reported this, because from each writer's
position nothing was wrong.

## The standing arrangement

Recorded in NOTES and followed from now on:

1. **Commit Design's files exactly as shipped, first**, labelled as Design's
   text, before touching anything. History then holds the original and no
   later operation can destroy it.
2. **Re-apply the mechanical layer as a second, separate commit.** Two
   commits, two diffs, nothing silent.
3. **Where Design's new prose has changed a passage a mark was attached to,
   do not guess where the mark goes.** Report the passage and leave it
   unmarked; assertions 6 and 7 will name it.
4. **Never run `git checkout` on a path holding someone else's uncommitted
   work.** Step 1 makes this impossible anyway.

Step 1 exists because of a real loss: reaching for `git checkout -- docs/design/`
to undo my own edits discarded Design's uncommitted reissue in the same
files, and there was no copy anywhere. Design had to re-send.

## What would remove the problem at its source

The layer is mechanical and re-derivable, so re-applying it is cheap. But it
is re-applied *by this repo*, which means Design cannot run the script on what
it ships and see it pass. Two options, neither this repo's to choose:

- **Design adopts the marks**, so the shipped file already carries them and
  round-trips cleanly.
- **The layer moves out of the file** — the withdrawal marking lives in a
  sidecar keyed by section id, and the script reads both. The targets stay
  pure Design, and nothing is lost in replacement.

The second is more work and removes the failure mode entirely. The first is
one instruction and keeps everything in one place.
