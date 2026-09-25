# A known-failing marker that runs nothing records only that someone once knew

`test.fixme` does not run the test body. Neither does `test.skip`. A
known-failing marker written with either records a fact about the past and
verifies nothing about the present.

## The instance

The matrix solid ships overhanging its cell's left edge by about a pixel,
against §21 and by a conflict inside §33 that Design is ruling. The interim
state was marked:

```ts
test('the matrix solid stays inside its cell (§21)', async ({ page }) => {
  test.fixme(true, '§33 vs §21: Design is ruling it');
  // ... 40 lines that measure the overhang and assert it is <= 0
});
```

The forty lines never executed. Playwright reported the test in its skipped
count, which looks like diligence: the run says a known issue is tracked. But
nothing measured the overhang, so:

- if the overhang grew from 1px to 50px, the marker would not notice;
- if the solid stopped rendering entirely, the marker would not notice;
- when Design rules and the conflict is fixed, the marker would **stay
  skipped**, and the fix would ship with a permanent reminder of a problem
  that no longer exists.

That last one is the worst. A skipped known-failing test has no path back to
green — it is a comment with a test's syntax and a test's place in the
summary.

## Why it is the test-that-cannot-fail family

This is the same defect as `scrollHeight` on a stretched track or `max-width`
against a cap: **the assertion is incapable of moving when the thing under
test changes.** What is different is only the excuse. The measurement cases
are wrong by accident; this one is wrong by a maintenance convention that
looks responsible.

The label is what makes it durable. Nobody audits a test marked known-failing,
because its name says its state is understood.

## The fix

**Pin the measured interim value, and let it run.**

```ts
test('the matrix solid stays inside its cell (§21) [KNOWN-FAILING]', async ({ page }) => {
  // ... measure the overhang for real ...
  expect(overhang, '§21 wants <= 0; §33 forces ~1px. Design is ruling it.').toBeGreaterThan(0);
  expect(overhang, 'and it has not grown beyond the measured ~1px').toBeLessThan(2);
});
```

The body runs every time. It fails if the overhang grows, if it disappears,
or if the solid stops rendering — and the day Design rules, it fails for
being unexpectedly correct, which is the notification that the marker should
come out. The name carries the state; the assertions carry the evidence.

**A known-failing test should be the most informative test in the suite**,
not the least: it is the one place where the current wrong value is written
down. `fixme` throws that away and keeps the label.

## When skip is right

Skipping is correct when the test *cannot* run — no credential, no container,
a platform the runner is not on. That is absent, and absent is honestly
reported. A defect that reproduces every run is not absent, and marking it so
is the [three-states](./a-reachable-signal-is-not-the-claim.md) confusion in
the harness: "we could not check" standing in for "we checked and it is still
wrong."
