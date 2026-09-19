'use client';

/**
 * A native select that submits its form when it changes. The rail is a GET
 * form (§11.13: every control works with JavaScript off, via the Apply
 * button); with JavaScript the change itself is the submit, so choosing a
 * genre is one gesture rather than two.
 */
export function RailSelect(props: React.ComponentProps<'select'>) {
  return <select {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
