# A lookalike parser is a second copy of a rule

**Finding for Design. The general form of a trap that cost three withdrawal
marks and produced a "the passage isn't there" report about text that was
plainly there.**

## What happened

Re-applying the mechanical layer after a Design round means finding each
withdrawn passage inside its section. A throwaway helper sliced sections on
the eyebrow signature:

```js
const sig = 'text-transform:uppercase;color:oklch(0.48 0.012 60)">';
const i = t.find(sig + sec + ' ·');
const j = t.find(sig, i + 10);       // ← next heading
```

Three marks then failed with "passage changed or absent" — for passages a
`grep` found immediately. **§26 contains a figure caption carrying the same
eyebrow styling as a section heading**, so `find(sig, …)` stopped at the
caption and §26's slice ended two-thirds of the way through the section. Its
last two passages fell outside their own section.

`check-index.mjs` reads the same sections correctly, because its pattern
requires an id followed by `" · "`:

```js
<p[^>]*style="[^"]*text-transform:uppercase[^"]*"[^>]*>\s*(?:§)?(ID) · ([^<]*)
```

The caption has the styling and no id, so the script never matched it.

## Why "be more careful" is the wrong fix

The helper was not careless — it was an *approximation* of a rule that already
existed in exact form. That is the failure mode, and it recurs because an
approximation is cheap to write and looks right on the cases in front of you.
The two implementations agreed on every section except one, which is exactly
how a copy drifts: not everywhere, once.

Three properties made it expensive:

- **It failed silently.** No error, no exception — just a section that
  appeared to be missing text.
- **It failed inward.** A truncated slice reports absence, and absence reads
  as "Design changed this", which sent the investigation at the wrong file.
- **It disagreed with a correct implementation sitting in the same repo.**
  The script had the right pattern the whole time.

## The fix

`scripts/design-target-parser.mjs` is now the one implementation: the section
id pattern, the heading regex, SVG removal, section slicing, live text and
section text. `check-index.mjs` imports it. Anything that slices these files
imports it.

Verified the refactor did not quietly stop checking: with the shared parser in
place, a reintroduced figure in §18's pointer column still fails 8b, and a
removed self-withdrawal mark still fails `6 §26/§26`.

## The general rule

**Where an exact implementation of a rule exists, importing it is not a
convenience — it is the only way to stay in agreement with it.**

`ASSERTIONS-spec.md` already makes this argument about its own allow-list:
"Change an allow-list only in this file, never in the script alone." Same
shape, one level down: change a parser in one module, never in a helper
beside it.

The signal to watch for: **writing a regex that resembles one already in the
repo.** At that moment the choice is to import or to fork, and forking is a
decision, not a shortcut — it should be made deliberately and written down,
not arrived at because importing felt like more work.
