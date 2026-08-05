/**
 * The small logger module CLAUDE.md §6 requires in place of bare `console.log`.
 *
 * Deliberately minimal: a single indirection so log calls are greppable, carry
 * a consistent prefix, and can later gain levels, redaction or a transport
 * without touching call sites. No dependency, and no Node built-ins — this is
 * imported by middleware, which runs in the Edge runtime.
 *
 * Never pass a secret's *value* to these. Messages reach logs, and on a
 * configuration error an operator may see them alongside a 500.
 */

type Scope = string;

function emit(level: 'error' | 'warn' | 'info', scope: Scope, message: string): void {
  const line = `[${scope}] ${message}`;

  // The one place in the codebase permitted to touch console directly; the
  // no-console rule in eslint.config.mjs exempts this file alone.
  console[level](line);
}

export const logger = {
  error(scope: Scope, message: string): void {
    emit('error', scope, message);
  },
  warn(scope: Scope, message: string): void {
    emit('warn', scope, message);
  },
  info(scope: Scope, message: string): void {
    emit('info', scope, message);
  },
};
