# Assertions 6 and 7 are set membership wearing a bijection's description

**Proposal for Design, with the mutation result that motivates it. Adam
predicted this; the mutation confirms it.**

## The mutation and its result

§26 now carries three withdrawal entries, two of which are an identical pair:

```json
["26", "26", "0.78 scale"],
["26", "31", "frame sized as the union over the list"],
["26", "26", "first wording of placement named solo and pair"]
```

**Delete one of §26's two `data-withdrawn-by="26"` marks, leaving the other:**

```
EXIT=0    PASS 6    PASS 7
```

A withdrawal mark was deleted from a design target and **the script reported
everything correct.** Verified the deletion was real: the "blaming the disc"
passage is unwrapped, and §26 now carries marks `['31', '26']` against three
list entries.

## Why neither assertion sees it

- **6** asks, for each entry `[s, by]`: does section `s` contain *some* mark
  whose value is `by`? Both `["26","26"]` entries are satisfied by the one
  surviving mark.
- **7** asks, for each mark in `s`: is `[s, mark]` in the list? The surviving
  mark is listed.

Both are **set-membership** checks. Neither counts, and neither can pair a
specific entry with a specific mark. The spec's own wording for 7 is singular
— "must appear as `s` in the withdrawal list, with `by` equal to the
attribute's value" — which has no meaning for a section carrying three
withdrawals.

This was invisible while every section had at most one withdrawal per
replacer. §26's third entry is the first case that breaks the correspondence,
and it arrived in the same reissue that made `[s, s]` explicitly legal.

## The proposed fix: identify the withdrawal

**Mark:**

```html
<span data-withdrawn-by="26" data-withdrawal="placement-wording">…</span>
```

**List entry, keyed on that id rather than on the pair:**

```json
["26", "26", "placement-wording", "first wording of placement named solo and pair"]
```

**Assertion 6** — every entry has a mark with its id:
> For each entry `[s, by, id, …]`, section `s` must contain a
> `[data-withdrawn-by]` element whose value is `by` **and whose
> `data-withdrawal` is `id`**.
> Fail: `6 §s/§by#id`.

**Assertion 7** — every mark's id is listed:
> Every `[data-withdrawn-by]` element in a non-`W` section must have a
> `data-withdrawal` id, and `[s, by, id]` must appear in the list.
> Fail: `7 §ID#id` (missing entry) or `7 §ID no-id` (unidentified mark).

That holds however many withdrawals a section carries, and the deleted mark
above would fail as `6 §26/§26#disc-blame`.

## A second gap: the list has no uniqueness rule

**Assertion 1 requires exactly one row per heading**, added after §W.35
carried two rows each holding material the other lacked. The withdrawal list
has no counterpart, so a duplicated entry is silent — and with ids, a
duplicated *id* within one section would be a genuine ambiguity rather than
harmless noise.

Proposed as part of the same change:

> **Assertion 7b.** No two entries share the same `[s, id]`.
> Fail: `7b §s#id duplicated`.

Cheap, and it closes the same hole assertion 1 closes one level up.

## Cost of the change

- **The spec:** wording for 6 and 7, plus 7b and the entry shape.
- **Design's files:** an id on each of the 15 marks and a third field on each
  list entry. Mechanical.
- **The script:** a small change in two assertions, plus one new check.

The ids are the author's own labels for passages they already described in the
list's third field — "0.78 scale", "corner reserve" — so most of the naming
work is already done.

## Note on method

The near-miss is worth recording beside this. A first attempt at the
self-withdrawal mutation removed the *first* `data-withdrawn-by="26"` in the
file, which belongs to §25's withdrawal **by** §26 — and the script correctly
reported `6 §25/§26`, which I nearly read as "assertion 6 cannot see
self-withdrawals." **A mutation aimed at the wrong element makes a working
assertion look broken.** The mutation has to be aimed as precisely as the
assertion it is testing.
