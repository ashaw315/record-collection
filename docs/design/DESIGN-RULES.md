# Design rules: Claude's standing rules for these documents

- Handoff changes go to Code as change files under `handoff-changes/`, marked prose-only. Never a whole copy of HANDOFF-wall-and-pull.md: it has two authors, and a whole-file replace reverts Code's step bodies and Done marks.
- Anchor every change file on text already in the repo, never on text an earlier change file introduces. Still name the files assumed applied.
- Settle mechanical questions with Code directly and report after: whether a withdrawal is owed, whether something is a draft fix, and where a withdrawal sentence goes. Bring to the user only disagreements with Code, or cases the written rules do not reach.
- The channel to Code: requests to Code go in the change files. Code's requests to Claude arrive in a block headed FOR DESIGN in Code's reports. Neither waits on the user.
- Specimens and sheets come from the build at a stated viewport, never drawn by hand. If one cannot be generated, say so.
- Rulings about appearance are provisional until built. Each provisional gets a line in the handoff's Provisionals list, closed by the step report that returns it.
- Claude never writes a file another author owns, including CLAUDE.md.
- Every withdrawal entry's description ends with a Build clause, saying whether the build followed the withdrawn claim: followed, did not follow, believed to follow (with the source), or nothing to follow. When the entry is filed, I state only what Code has reported. The intake confirms or corrects a clause that a drop can settle. A "believed to follow" is closed only by the step that runs the build and confirms it, and that step's report names the entry. Where the build held something that matches neither the withdrawn claim nor the live one, the clause says so in its own words rather than forcing a category. A withdrawal the build still follows is open work, not a closed record.
