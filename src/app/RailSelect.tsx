'use client';

import { useEffect, useRef } from 'react';

/**
 * A native select that submits its form when it changes. The rail is a GET
 * form (§11.13: every control works with JavaScript off, via the Apply
 * button); with JavaScript the change itself is the submit, so choosing a
 * genre is one gesture rather than two.
 *
 * `data-hydrated` appears only after the effect runs: the select is
 * server-rendered, so its presence proves nothing about the handler, and a
 * change dispatched before hydration submits nothing.
 */
export function RailSelect(props: React.ComponentProps<'select'>) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('data-hydrated', 'true');
  }, []);
  return <select ref={ref} {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
