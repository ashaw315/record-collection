# A31 — §10b's snippet: the columns that were never built, the endpoints that were never specified, and what "refuse" means

Written alongside step 13c unit 1.

**Why this amendment exists.** A4 added `snippet` and `snippet_edited_at` to §4.2
and the columns were never created. Measured before planning unit 1:

| location | `snippet` / `snippet_edited_at` |
|---|---|
| SPEC §4.2 | **present**, with the full §7.8 rationale |
| `src/db/schema.ts` | **absent** |
| all 15 `drizzle/*.sql` | **absent** |
| dev Neon `records` | **absent** |

An amendment is a claim about the DOCUMENT, and nothing checks it against the
database. Recorded separately in NOTES; A31 exists partly to stop the same gap
recurring for the endpoints, which §5 never carried at all.

---

## A31a — §10b: what "a regeneration must refuse" actually means

§4.2 says a regeneration "must refuse rather than overwrite" once
`snippet_edited_at` is set. That is the right rule and it does not say what the
user sees, and "refuse" has three shapes that are three different products:

1. **The affordance is absent.** Safe, and it hides a capability with no
   explanation — the user cannot tell a missing feature from a withheld one.
2. **The affordance is present and refuses with a reason.** Honest about the
   rule, and it offers a button that does not work.
3. **The affordance is present and offers to REPLACE, with the consequence
   named.**

**ADD to §10b's snippet section:**

> **Regenerating a snippet the user has edited is offered, not hidden, and it names what will be lost.** Once `snippet_edited_at` is set the text is the user's, so a regeneration must never proceed silently — but it is offered, behind a confirmation that says the edited text will be replaced and cannot be recovered. The same shape §7.3 requires for deleting an acquired want-list row: "a confirmation naming what is lost, not a bare delete button."
>
> **The reasoning is §7.8's actual scope.** §7.8 forbids overwriting user-entered data *with external data* — the Discogs re-sync case, where the app acts unasked and the user learns afterwards. It is a rule about what the app does on its own initiative, not a rule about what its owner may deliberately choose. §7.3 already draws exactly this line for a structurally identical case: "The rule is about *implicit* loss: acquiring must not discard history as a side effect of a different action. An **explicit** user delete of an acquired item is permitted. Mistakes happen, this is a personal tool."
>
> A snippet the user edited and now wants regenerated is the same situation: they typed it, they can see it, and they are asking. Hiding the control would treat the owner of the text as the threat the rule protects against.
>
> **Confirmation only where there is something to lose.** With `snippet_edited_at` null, the stored text is as generated and regeneration replaces it without asking — there is no user work at stake, and a confirmation on every regeneration would train the user to dismiss the one that matters.
>
> **The confirmation names the text, not the rule.** "Replace the snippet you edited? Your version will be lost." — not "this record has snippet_edited_at set". The consequence is what must be legible.

**Consequently `snippet_edited_at` is not a lock, and §4.2's wording is
narrowed.** It records *who owns the text*, which determines whether replacing it
needs consent — not whether replacing it is possible. The server still refuses a
regeneration that does not carry explicit confirmation, so the rule is enforced
server-side and not by the presence of a dialog.

---

## A31b — §5.2: the snippet endpoints, which were never specified

§5 carries no snippet route. §5.8 covers `/api/suggestions/ai` only, so 13c's
generation path had no specified contract.

**ADD to §5.2's table:**

| Method | Path | Notes |
|---|---|---|
| POST | `/api/records/:id/snippet` | Generate and store a snippet (§10b). Rate-limited with §9.2 against `llm_requests` (`kind: 'snippet'`). Body: `{ confirmReplace?: boolean }`. |
| PATCH | `/api/records/:id/snippet` | Save a user edit. Sets `snippet_edited_at`. Body: `{ snippet: string }`. |
| DELETE | `/api/records/:id/snippet` | Clears `snippet`, leaves `snippet_edited_at` (§4.2 — a deliberate deletion is an edit). |

> **`confirmReplace` is required only when `snippet_edited_at` is set**, and its
> absence there is a refusal rather than a silent overwrite: `409` with a code
> naming the situation, so a client that has not asked the user cannot destroy
> their text by omission. Defaulting it to true would put the safety in the UI,
> where the next caller — a script, a retry, a second client — does not inherit
> it.
>
> **It is a separate resource rather than fields on `PATCH /api/records/:id`.**
> Generation spends a rate-limited external budget and the other two do not, so
> folding them into the record PATCH would put a metered side effect behind a
> general-purpose update. §5.9 makes the same split for images.

---

## A31c — §12: 13c is three units

**REPLACE 13c's note with:**

> **13c. The snippet** (§10b), in three units.
>
> **Unit 1 — the column and the ownership rule.** The migration A4 implied and never produced, the query-layer writes, and §7.8's rule as pure state: a regeneration without confirmation refuses when `snippet_edited_at` is set; a delete clears the text and keeps the timestamp. **No LLM.** Testable with no mock, no fixture and no injected client, because a rule about who owns a piece of text is pure state.
>
> **Unit 2 — the generation path.** The prompt, `kind: 'snippet'` through the shared limiter, the parse boundary, and `POST`. Consumes unit 1's refusal rather than defining it.
>
> **Unit 3 — the panel UI.** Display with the generated label, edit, delete, and the confirmation A31a specifies.
>
> **Why the ownership rule is judged alone.** Every other failure in this feature is recoverable: a bad snippet is regenerated, a 500 is retried. Silently overwriting text the user wrote is permanent. Judging that rule in the same unit as a prompt, a route and a UI is how it gets waved through — the same argument that split §9.1 from §9.2, and that R5 found worth having.
