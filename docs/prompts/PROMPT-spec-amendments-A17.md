# SPEC.md amendment A17 — follow-up to f8620d3

Two remaining occurrences of live "graph" vocabulary. Same rules: **exact anchors, no
fuzzy matching, nothing outside the blocks, `SPEC.md` only.**

You found the second of these and correctly declined to widen scope. An exhaustive
`grep -in "graph" SPEC.md` then found a third, in §4.3 — which is the one that matters
more, because it is in the schema section explaining why four tables exist.

Anchors extracted by execution from SPEC.md at f8620d3.

---

## A17a — §4.3's junction tables are attributed to a retired screen

**Why.** §4.3 opens by telling the reader what the junction tables are *for*, and what it
says they are for was deleted at step 13. A reader arriving at `record_genres` or
`artist_genres` is told their purpose is a network graph, and there is no network graph.
These tables are load-bearing for the shelf's ordering, the collection's filtering,
`/api/records/facets`, and §9's suggestions — four live consumers, none of them named.

**REPLACE:**

> These power the network graph. All are composite-PK, no separate `id`.

**WITH:**

> These carry the relationships the rest of the app reads: genre filtering and its hierarchy rollup (§7.1), the collection's facet counts (§5.2), the shelf's genre ordering (§10b), and §9.1's suggestion scoring. All are composite-PK, no separate `id`.
>
> An earlier version of this line said they power the network graph. That screen is retired (§8); the tables and every other consumer of them are not.

---

## A17b — §10's screens table still says "Graph-based"

**Why.** The fifth occurrence, missed by A16's rationale, which counted four. Live
vocabulary rather than a historical quote.

**REPLACE:**

> | Suggestions | `/suggestions` | Graph-based list with reasons, always present. Separate "Ask Claude for gap analysis" button for §9.2. Add-to-want-list on each. |

**WITH:**

> | Suggestions | `/suggestions` | Relationship-based list with reasons, always present. Separate "Ask Claude for gap analysis" button for §9.2. Add-to-want-list on each. |

---

## Deliberately left alone

`grep -in "graph"` returns other hits. Do not touch them; each is justified:

- **§8 in its entirety** — the retirement note, which necessarily names what it retires.
- **§5.6's note, §1's closing line, §12 step 12, §12's "Why 10 and 11 come before 12", §10b's "What this replaces", line 47's `d3-force` bullet** — all retrospective, each saying in the same sentence that the thing is retired.
- **§9.1's line 686** — quotes the old name while explaining the rename.
- **§12 step 11's "lineup graph"** — describes the shape of the MusicBrainz walk (band → person → that person's other bands), not §8.1's screen. Generic and correct.
- **"photograph"** — §4.2, §10b twice, §11 flow 7. Substring matches.

## Verify

```
grep -in "graph" SPEC.md | grep -vi "photograph\|musicbrainz"
```

Read every hit and confirm it falls into one of the categories above. **Do not report
"clean" — report the count and the classification**, because the last two passes of this
each asserted coverage they did not have.

## NOTES.md

Add a short entry under the existing confident-undercount rule. Fourth instance, and the
first where the instrument was a hand enumeration in a planning document rather than a
grep in code:

> The SPEC amendment sets under-counted the same class three times running — "four places
> use this term" was five, then six. Each pass found the ones the previous pass named plus
> one more, because each searched for the specific phrase (`graph-based`) rather than the
> root (`graph`). The correction is not a more careful list: it is that a claim about
> coverage in a planning document is an assertion, and gets verified by execution like any
> other. Same family as the `validationError` two-endpoints-that-were-eight finding.

## Commit

```
git add SPEC.md NOTES.md
git commit -m "SPEC: A17, the last of the retired graph vocabulary"
```

Then stop. Step 13's three.js work is next and is a separate unit.
