# SPEC.md amendments A15–A16 — follow-up to 6100a2e

Two amendments the cross-reference sweep found after `6100a2e` landed. Both are small.
Same rules as last time: **exact anchors, no fuzzy matching, nothing outside the blocks,
`SPEC.md` only.** If an anchor does not match, stop that amendment and quote it.

Unlike the first fourteen, these anchors were extracted from SPEC.md **at 6100a2e by
execution**, not transcribed. If one fails to match, something has moved since — say so
rather than searching for an approximation.

---

## A15 — §14's endpoint line still demands what §5.6 no longer supplies

**Why.** A6 put the "no endpoint exists to satisfy a completeness line" rule inside §5.6.
§14 was never touched, so it still reads as an unqualified checklist item — and §14 is
read as a checklist, at the point where someone is closing the project and looking for
things that are missing. This is the line that produced dead `/api/graph` in the first
place (R4 unit 6: two mandates in tension, the spec line was the defect), and it is
currently still capable of producing another one.

The amendments file claimed A6 had closed this. It had not. Recorded here rather than
quietly fixed, because a document asserting a fix it did not make is the failure this
whole exercise was about.

**REPLACE:**

> - Every endpoint in §5 implemented and integration-tested.

**WITH:**

> - Every endpoint in §5 implemented and integration-tested — noting that §5.6 lists none, deliberately. Where a server component or a query-layer function is the sole consumer, the contract and its tests live at that layer and **no endpoint is built to satisfy this line.** An endpoint whose only caller is its own test satisfies this checklist and fails the app.

---

## A16 — "graph-based" names a structure the spec no longer defines

**Why.** §8's retirement removed the only definition of "the graph." Four places still use
the term as live vocabulary, and one of them is §12 step 14 — the next feature step after
the one in progress. The term is not wrong: influence edges, shared memberships and genre
counts genuinely are a graph. But it now has no referent in the document, so a reader
meeting "graph-based suggestions" goes looking for §8 and finds an obituary.

Renaming rather than redefining, because the alternative is reintroducing a definition of
"the graph" three sections after retiring it — and the suggestion engine reads three
tables, which is what it should say.

**A16a — §9.1 heading and opening. REPLACE:**

> ### 9.1 Graph-based (default, always on)
>
> `GET /api/suggestions`. Pure computation, no external calls.

**WITH:**

> ### 9.1 Relationship-based (default, always on)
>
> `GET /api/suggestions`. Pure computation, no external calls.
>
> **It reads three tables and no screen.** `artist_influences` (edges the user asserted), `artist_memberships` (lineups imported from MusicBrainz, §4.3), and `record_genres` rolled up through the hierarchy (§7.1). Earlier versions of this spec called this "graph-based" after §8.1's visualization; that screen is retired (§8) and the relationships it drew are not. The name changed so that nothing sends a reader looking for a graph to find one.

**A16b — §5.8 endpoint table. REPLACE:**

> | GET | `/api/suggestions` | Graph-based suggestions, §9.1. Query: `limit` (default 10). |

**WITH:**

> | GET | `/api/suggestions` | Relationship-based suggestions, §9.1. Query: `limit` (default 10). |

**A16c — §11 E2E flow 8. REPLACE:**

> 8. Request graph-based suggestions and add one to the want-list.

**WITH:**

> 8. Request relationship-based suggestions and add one to the want-list.

**A16d — §12 step 14. REPLACE:**

> 14. Suggestions — graph-based first, then LLM-assisted. E2E #8.

**WITH:**

> 14. Suggestions — relationship-based first (§9.1), then LLM-assisted (§9.2). E2E #8.

---

## Verify

```
grep -n "graph-based\|Graph-based" SPEC.md
grep -n "Every endpoint in §5" SPEC.md
```

The first must return nothing. The second returns two hits — §11's integration line, which
is correct as it stands and is **not** part of this amendment, and §14's, which must now
carry the qualifier.

Then re-read §9.1 in full and answer one question: **does it now say what it reads, without
depending on any other section for its vocabulary?** If §9.1 still needs §8 to be
intelligible, A16 did not do its job.

## Commit

```
git add SPEC.md
git commit -m "SPEC: A15-A16, close the endpoint carve-out and rename graph-based suggestions"
```

Stage by path. Then stop — step 13's three.js work is next and is a separate unit.
