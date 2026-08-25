# Build prompts

One file per unit of work, in the order they were given. These are the
instructions the build ran on — kept because **NOTES.md records what was
decided and these record what was asked for**, and several times in this build
the difference mattered:

- a prompt that named the wrong axis, corrected by measurement rather than by
  argument;
- a hypothesis stated confidently in a prompt that the implementing session
  overturned (three reviews had their central claim changed this way — see
  REVIEW-PLAN.md's standing rule, "verify before fixing");
- candidates rejected with reasoning that exists nowhere else, because the
  thing that was not built leaves no trace in the code.

R7 is a cold read of this codebase and R8 is domain correctness. A reader
asking *why is the wall a WebGL scene* or *why did FRAME_FILL lose to a
viewport-region centre* is better served with these than without.

They are history, not instructions. Nothing here is current: where a prompt and
`SPEC.md` disagree, the spec is authoritative, and where a prompt and `NOTES.md`
disagree about an outcome, NOTES won because it was written afterwards.

`../SPEC-AMENDMENTS.md` sits alongside them and carries A1–A14 in full; A15
onward were each requested by their own `PROMPT-spec-amendments-*.md` file here
and applied directly to `SPEC.md`. A20, A23 and A25 were never allocated. A34
has no prompt file — it was decided inside step 15's 13b work rather than
requested separately, and is recorded in `SPEC.md` §10b and `NOTES.md`.
