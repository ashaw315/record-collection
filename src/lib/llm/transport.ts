/**
 * What every Anthropic call observes about itself.
 *
 * **This module exists because the same defect appeared in two callers.** A37's
 * length bound and A38's `stop_reason` logging were written into the
 * gap-analysis path during a live failure — and the snippet, which shares the
 * transport and the quota, had neither. It truncated silently on success and
 * failed undiagnosably on failure, months after the sibling was fixed.
 *
 * **The layer question, not the duplication count.** These are properties of
 * CALLING ANTHROPIC: `stop_reason` says whether the model finished, usage says
 * what it cost, and neither sentence can be written in the vocabulary of gap
 * analysis or of snippets without reading strangely. There is no third caller
 * to wait for — two, one fixed and one not, is already evidence the fix was at
 * the wrong layer.
 *
 * See NOTES: "when one defect appears in two callers of a dependency, ask which
 * LAYER it belongs to".
 */

/**
 * Reasoning effort, and **it is REQUIRED on every request.**
 *
 * **`max_tokens` bounds THINKING PLUS OUTPUT.** A caller that omits
 * `output_config` gets whatever the model defaults to, and reasoning can consume
 * the budget before the response is finished — which is exactly how two snippets
 * were cut at ~80 and ~96 output tokens under a 400-token ceiling, months after
 * the sibling caller set `effort` deliberately.
 *
 * **There is no safe default, which is why this is required rather than
 * defaulted.** `low` would degrade a gap analysis, which reasons across a whole
 * collection; `high` is what truncated a two-sentence note. The two callers
 * genuinely need different values, so a default would be right for one and
 * silently wrong for the other.
 *
 * **Required means the compiler catches it.** Omission was previously legal —
 * the field was optional on a type owned by one caller — so a new caller would
 * compile, pass review, and truncate at runtime with nothing to indicate why.
 * A property of CALLING ANTHROPIC, enforced where the call is described.
 */
export type Effort = 'low' | 'medium' | 'high';

/** What every caller must supply. `output_config` is deliberately not optional. */
export type AnthropicRequest = {
  model: string;
  max_tokens: number;
  output_config: { effort: Effort };
  messages: Array<{ role: 'user'; content: string }>;
};

/** The SDK response, including the two fields an early cast used to discard. */
export type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
  /** `end_turn` finished; `max_tokens` ran out of room. */
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
};

/**
 * SHAPE ONLY — counts and a stop reason, never response text.
 *
 * The prompt carries the user's collection, so a reply can echo it, and these
 * fields reach logs. A deliberate log must not get a weaker standard than the
 * accidental one `describeError` was hardened into (R6).
 */
export type Observed = {
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

/**
 * **Nullable, never defaulted.** A transport reporting no usage has not measured
 * zero — it has not measured. A `0` would be a fabricated measurement, the same
 * reason `llm_requests` keeps these columns nullable (A38).
 */
export function observeUsage(response: AnthropicResponse): Observed {
  return {
    stopReason: response.stop_reason ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

/**
 * Whether the model stopped because it hit the ceiling rather than because it
 * finished.
 *
 * **Every caller needs this and only one had it.** The gap analysis discovered
 * truncation through unparseable JSON — an accident of its output format. The
 * snippet is prose, so nothing failed to parse and a half-sentence was stored as
 * if complete. `stop_reason` answers it for both, which is why it is here rather
 * than in either caller's parser.
 *
 * **Unknown is not truncated.** A transport that reports no stop reason has told
 * us nothing, and treating silence as truncation would reject good responses —
 * absent versus unknown.
 */
export function ranOutOfRoom(observed: Observed): boolean {
  return observed.stopReason === 'max_tokens';
}
