# Step 14 unit 4 — §9.2, the LLM gap analysis (scoping)

Baseline `9252603`. **This is a scoping document, not a build prompt.** Read it, then report
the decisions and open questions before writing anything.

This unit is materially different from units 1–3. Those were computation over tables that
already existed. This one sends collection data to an external service, trusts what comes
back, and offers to write the result to the want list. R5 exists to review exactly this, and
it runs after step 14 and before step 15 — so the decisions made here are what R5 will attack.

§12 pins **13c, the snippet**, to this unit: same API client, same rate limit, same JSON-parse
boundary, and R5 reviews that boundary once rather than twice.

---

## 1. What leaves the machine — field by field

R5's first attack line is *"field by field, not 'a summary'"*, and §9.2's own wording — "build
a compact summary of the collection… do not dump raw rows" — is a description, not a
specification.

**Enumerate what is sent, explicitly, and enumerate what is not.** §9.2 names owned artists
grouped by genre, the want list with priorities, and label counts. Sitting one join away from
those are `purchase_price`, `purchase_date`, `store_id`, `journal_entries`, `matrix_runout`
and `notes` — a journal entry is a diary, and a store name plus a purchase date is a
movement record.

**The exclusion needs a test, not a comment.** "We didn't include it" is a claim about code
that will change, and this project has a rule about claims that nothing checks. Assert that a
planted sentinel in an excluded field never appears in the outbound payload — the same shape
as the deferred `cause`-chain fix, which specifies planting a secret in a nested cause and
asserting it does not reach the log.

**Answer the question in Adam's terms:** would he paste this payload into a public forum? If
any field gives pause, it does not go.

---

## 2. What comes back, and the parse boundary

§9.2 requires JSON-only output, markdown fences stripped, and graceful parse failure with a
user-visible error rather than a crash. R5 enumerates the cases and they are the test plan:

- markdown fences around valid JSON
- a truncated response
- valid JSON of the wrong shape
- an empty array
- a suggestion naming an artist already in the collection
- a suggestion naming a record already on the want list

The last two are not parse failures — they are **the model being unhelpful in a way the app
must handle**, and §9.1 already has a rule for the analogous case: suppress rather than hide,
because a suggestion the user has already acted on is information, not noise.

**A malformed response must be distinguishable from an empty one.** "The model returned
nothing" and "the model returned something we could not read" are different facts, and
collapsing them is the absent-versus-unknown failure this project keeps meeting.

---

## 3. Can an LLM suggestion reach the want list without a human step?

**This is genuinely open and it differs from unit 3's answer.** A §9.1 suggestion names an
artist, and `want_list.title` is NOT NULL, so there was no honest title and the action had to
prefill a form. An LLM suggestion names a *record* — artist, title, reason, genre — so a title
exists.

But it is a title **the model produced**, and §5.7's whole architecture exists because a
client asserting a fact the server can establish is the pattern to eliminate. The model is a
less reliable client than a user: it can name a record that does not exist, misattribute one,
or invent a catalogue number.

Three readings, and the choice is a product decision:

- **One-click add**, trusting the model's title. Fast, and the want list fills with rows
  nobody verified.
- **Prefill the form**, as unit 3 does. Consistent, slower, and the user confirms a record
  exists before it is stored.
- **Prefill via `/lookup`**, so a Discogs search verifies the record exists before it reaches
  the want list at all. Slowest, and the only one where a hallucinated record cannot land.

**Whatever is chosen, §10b's labelling rule applies**: an LLM suggestion is the app asserting
things about music, and it must read as generated rather than as fact the app established.

---

## 4. The rate limit, and where it is enforced

§9.2 says 10 requests/hour, user-initiated only, never on page load. R5 asks whether it is
enforced server-side or trusted from the client, and what exhaustion looks like.

**Server-side, and exhaustion needs a legible answer** — not a 500, and not silence. NOTES
records the equivalent finding for `BLOB_READ_WRITE_TOKEN`: a missing credential returning
"Internal server error" sends the reader to application logs for a deployment problem the app
could name. An exhausted rate limit is a fact the app knows.

The token-bucket limiter from step 7 exists and is generic — check whether it fits before
writing a second one.

---

## 5. The snippet (13c), in the same unit

§10b: two or three sentences about the album, generated once and **stored**, labelled as
generated, never contradicting entered data, editable and deletable, absence is fine. §4.2
carries `snippet` and `snippet_edited_at`, where a non-null edit timestamp means the user owns
the text and a regeneration must refuse (§7.8).

**It shares the client, the limiter and the parse boundary with §9.2** — which is why §12 pins
them together. What it does not share is the disclosure question: a snippet request sends one
record, not a collection summary.

---

## 6. What must not happen

- **No live call in any test.** The guard is host-agnostic and already covers hosts that did
  not exist when it was written. Verify it covers Anthropic before relying on it.
- **`ANTHROPIC_API_KEY` is optional at boot** and must fail legibly at point of use, like
  Blob and the MusicBrainz contact. R6 owns the deploy question; this unit owns the message.
- **Never on page load.** Both features are user-initiated.

---

## Report before building

1. **The field list** — what is sent, what is excluded, and how the exclusion is tested.
2. **Your reading on question 3**, with reasoning. This is the one I want argued rather than
   assumed.
3. **Whether the step 7 limiter fits**, measured rather than guessed.
4. **What the prompt actually is.** §9.2 requires genre-accurate reasoning and explicitly
   forbids flattening UK first-wave punk, UK82, US hardcore, horror punk and psychobilly into
   "punk" — CLAUDE.md §8 calls this the place that distinction matters most. The prompt is the
   feature; show it.
5. **Whether §9.2 and 13c should be one unit or two**, now that you have read both. §12 pins
   them together for the shared boundary, and that reasoning may or may not survive contact.

Then stop. Nothing gets built until those five are answered.
