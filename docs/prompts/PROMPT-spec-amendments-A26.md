# SPEC.md amendment A26 — step 13 closes, and what moves out of it

Baseline `b8c4994`.

**Anchors could not be extracted by execution** — SPEC.md has moved repeatedly since my last
copy. If any does not match, stop and quote what is there.

---

## Why

Step 13 has delivered the shelf: the wall in one three.js scene, records that come out of an
emptied slot and return, hover, tilt, flip, the panels, filtering, the accessible list, and a
photograph-is-unlit rule governing every surface. It is the feature §10b describes.

Three §10b clauses are unbuilt, and none of them should hold the build order open:

- **The gatefold hinge** cannot be triggered by anything in the collection. It needs two inner
  photographs per record, which needs the Discogs measurement and an add-record UI for
  assigning image slots. Those are real work with real unknowns.
- **Arrow navigation** between records is small and self-contained.
- **The snippet** is an LLM feature. §9.2 is step 14 and owns the Anthropic client, the rate
  limit, the JSON-parse boundary and R5's review of what leaves the machine. Building a second
  LLM call in step 13 means building that boundary twice.

Leaving three unbuilt clauses inside a step marked complete is the shape this document has
just spent twenty-six amendments correcting. So they move, with triggers.

---

## A26a — §12: step 13's entry states what it delivered

**REPLACE:**

> 13. **The shelf (§10b).** The collection as a wall of sleeves, replacing the shelf-ordering feature and the graph screen.

**WITH:**

> 13. **The shelf (§10b).** The collection as a wall of sleeves, replacing the shelf-ordering feature and the graph screen. Delivered: the wall and the pulled record in one `three.js` scene, so a record leaves an emptied slot; hover, tilt, turn, the flanking panels, filtering, and a keyboard-reachable list of every record. Three §10b clauses are deliberately **not** in this step and are listed at 13a, 13b and 13c below.

**And ADD after step 16:**

> **Deferred out of step 13, each with a trigger.** These are §10b features, built later rather than never:
>
> **13a. The gatefold hinge.** Two leaves about a shared edge, and the affordance only where both inner photographs exist (§10b, A21c). **Trigger: after the Discogs inner-image measurement and the add-record slot-assignment UI.** Nothing in the collection can open a gatefold until images can be assigned to `gatefold_left` and `gatefold_right`, so the hinge has nothing to act on. The scene already wires both slots through the surface-kind rule, so the geometry is what is missing.
>
> **13b. Arrow navigation between records** (§10b). Moving through the collection without putting the record back. **Trigger: step 15's mobile pass**, which is already touching how the wall is navigated on a small screen, and where "browsing is continuous" matters most.
>
> **13c. The snippet** (§10b). **Trigger: step 14**, with §9.2's LLM work. It is a second call to the same API and it needs the same rate limit, the same JSON-parse boundary, and the same answer to R5's question about what leaves the machine. Building it here would build that boundary twice, and R5 is scoped to review it once.

---

## A26b — §12: the measurement that gates 13a

**ADD as a new step between 14 and 15:**

> 14a. **Measure Discogs' inner images, then build slot assignment.** Discogs carries gatefold artwork on some releases, which makes 13a reachable — but three things are assumptions rather than facts and this project's record on assuming API shapes is poor (`format.text`, the versions payload, the master-year fallback each cost a round).
>
> Measure against the live API on a known gatefold release, before designing anything on top: how the payload types an inner image, given `images[].type` is only `primary`/`secondary`; whether it is one wide spread or two square leaves; and what §6's field mapping would have to gain for the importer to carry them at all.
>
> Then build the assignment UI. **The importer does not assign slots automatically** — Discogs' types cannot distinguish a left leaf from a right leaf from a back cover, and a wrong guess opens a hinge onto artwork that is not the inner sleeve, which is the invented-stand-in failure §10b's strictest rule forbids. The add-record form surfaces the release's images as candidates and the user assigns them, the same shape §5.7 already uses for every other field: Discogs supplies the material, the user supplies the judgement.
>
> A single wide scan of an open gatefold cannot fill two square slots (A21b). It goes to the gallery as `other`, and a user who wants the hinge photographs the sleeve themselves. That is honest — splitting a scan down the middle and hoping the seam lands right is not.

---

## A26c — §10b: mark the three clauses

**ADD at the end of §10b, before "What this replaces":**

> **Three clauses in this section are specified and not yet built**, each moved out of step 13 with a trigger rather than left open inside it: the gatefold hinge (§12, 13a), arrow navigation between records (13b), and the snippet (13c). Everything else described above is built and live at `/`.
>
> The gatefold's four texture slots exist in the schema (§4.2) and are wired through the scene's surface-kind rule, so what is missing is the hinge geometry and a way to fill the slots — not the model.

---

## Verify

```
grep -n "13a\|13b\|13c\|14a" SPEC.md
grep -n "gatefold" SPEC.md
grep -n "snippet" SPEC.md
```

Classify every hit. Then read §12 end to end and answer: **does the build order now describe
what was built, and does every deferred clause have a trigger?** A deferral without a trigger
is a decision never to do it, and that rule is why this amendment exists.

## Commit

```
git add SPEC.md
git commit -m "SPEC: A26, step 13 closes and its unbuilt clauses move out with triggers"
```

Then stop.
