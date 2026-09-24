# A declared value is not a measurement

**Finding for Design, from the §27–§28 genres work. Companion to
`inline-values-and-width.md`: same class, different carrier.**

## The shape

An element's declared value and the value it actually gets are two different
things, and the DOM will hand you either one without saying which you asked
for. A test that reads the declared value is asserting its own input — it
passes because the code set the thing it is reading, not because the page
does what the test claims.

## The instance

`RecordPage8a` declares the identity band's height inline:

    style={{ height: BANDS.identity }}      // 547

§18's fork then overrides it in a stylesheet:

    @media (max-width: 1439px) { [data-band] { height: auto !important; } }

Measured at 1280:

| | value |
|---|---|
| `band.style.height` (declared) | **`547px`** |
| `getBoundingClientRect().height` (used) | **`387.5px`** |

The `!important` rule wins the cascade, but **it does not touch the inline
attribute**. So a guard written as `band.style.height !== 'auto'` reads 547,
concludes the band is on its fixed height, and is wrong by 160px — which is
exactly what happened: the collapse trigger ran on a shrink-wrapped cell where
demand equals supply by construction, and collapsed the genres run on every
record.

## Why reading the computed value is not the fix either

`getComputedStyle(band).height` returns the *used* value — `387.516px`, not
`auto`. It never reports `auto` for a rendered box, so a test comparing it
against `'auto'` also fails, silently and in the opposite direction. There is
no string to compare against.

**What works is comparing the two:**

    const declared = parseFloat(band.style.height);
    const fixedHeight = !Number.isNaN(declared)
      && Math.abs(band.getBoundingClientRect().height - declared) < 1;

The band is on its fixed height only when the height it declared is the height
it got. That is a measurement of the relationship, and it cannot be satisfied
by the code that set either side alone.

## The general form

**Wherever a value can be declared in one place and overridden in another,
a test that reads the declaration is testing the declaration.** The three
carriers seen in this build:

| carrier | declared where | overridden where | what a naive read returns |
|---|---|---|---|
| inline style vs stylesheet | `style={{ … }}` | `@media … !important` | the inline value, always |
| computed style vs `auto` | stylesheet | layout | a px value, never `auto` |
| constant vs render | a module constant | a later ruling | the constant, not the page |

This is the same failure CLAUDE.md §2 records three times under a different
name — "the assertion tests a proxy one layer below the claim". The proxy
there was a variable standing in for a connection, a token for a rendering, a
source string for a behaviour. Here it is a declaration standing in for a
layout. **The fix is the same one: assert the channel that carries the claim,
which for a layout is always the rendered box.**

## What this cost

The genres collapse fired on every record in the collection for one round,
and the guard that was supposed to prevent exactly that read `547` and
approved. It was found by printing both numbers side by side — not by reading
the code, which looked correct, and not by the test suite, which had no
assertion that could tell the two values apart.
