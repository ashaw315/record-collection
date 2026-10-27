# Design rules: Claude's standing rules for these documents

- Handoff changes go to Code as change files under `handoff-changes/`, marked prose-only. Never a whole copy of HANDOFF-wall-and-pull.md: it has two authors, and a whole-file replace reverts Code's step bodies and Done marks.
- Anchor every change file on text already in the repo, never on text an earlier change file introduces. Still name the files assumed applied.
- Settle mechanical questions with Code directly and report after: whether a withdrawal is owed, whether something is a draft fix, and where a withdrawal sentence goes. Bring to the user only disagreements with Code, or cases the written rules do not reach.
- The channel to Code: requests to Code go in the change files. Code's requests to Claude arrive in a block headed FOR DESIGN in Code's reports. Neither waits on the user.
- Specimens and sheets come from the build at a stated viewport, never drawn by hand. If one cannot be generated, say so.
- Rulings about appearance are provisional until built. Each provisional gets a line in the handoff's Provisionals list, closed by the step report that returns it.
- Claude never writes a file another author owns, including CLAUDE.md.
