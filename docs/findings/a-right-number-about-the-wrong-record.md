# A right number about the wrong record

**A statistic computed over one ordering and read off another is not a wrong
number. It is a right number about the wrong row.**

## The instance

Step 29 reported §5.5's floor under §33's per-record fit as "worst 1.080%,
was 0.641%" and "median 1.485%, was 0.660%". The recorded baseline from step
23 is **0.5084% worst, 0.7535% median**.

The script sorted the seventeen records by their §33 value, then read the
shared-frame column off the reordered list:

```js
const sorted = [...rows].sort((a, b) => a.own - b.own);
console.log(`WORST : ${pct(sorted[0].own)} (was ${pct(sorted[0].shared)})`);
//                                               ^ the shared value of
//                                                 whichever record is now first
```

Both printed figures were real measurements of real records. Neither was the
worst or median of the shared-frame distribution, because the worst record
under one scaling is not the worst under the other.

## The signature

**The pair converged where the true pair spreads.** The recorded baseline
runs 0.5084 to 0.7535, a spread of 0.245 points. The mis-sorted pair read
0.641 and 0.660, a spread of 0.019 — an order of magnitude tighter.

That is the tell, and it is general: a mis-sorted join samples two *interior*
rows of a distribution rather than its extremes, so the reported spread
collapses toward the middle. Two statistics that should differ and barely do
is evidence of a join before it is evidence about the data.

## Why it survives inspection

Every guard a number usually trips was satisfied:

| check | result |
|---|---|
| is it in range? | yes — both inside the observed distribution |
| is it the right magnitude? | yes — same units, same order |
| does it move the right way? | yes — both below the §33 figures |
| is it reproducible? | yes — deterministic, same every run |

The number is wrong only in what it is *about*, and nothing local can see
that. It took an external record — Design's 0.5084/0.7535 — to catch it.

## The check

**Compute each statistic over its own ordering.** Never read a second column
off a list sorted by the first:

```js
const stat = (key) => {
  const s = [...rows].sort((a, b) => a[key] - b[key]);
  return { worst: s[0][key], median: s[Math.floor(s.length / 2)][key] };
};
```

And when a baseline exists on the record, reproduce it before reporting any
delta against it. The corrected script prints the shared-frame pair beside
the recorded figures so a mismatch is visible in the output rather than
needing a reader who remembers.

## The adjacent trap it exposed

Labelling rows `id.slice(0, 8)` printed `4a1e2b7c` five times, because five
fixture ids are synthetic extremes differing only in the final digit. That
reads as duplicated rows in a table where duplication would itself be a bug —
a second way for a correct table to look wrong. Labels now carry head and
tail.

Related: [the reachable signal](./a-reachable-signal-is-not-the-claim.md) is
the same family one level down — there the quantity is wrong, here the row is.
