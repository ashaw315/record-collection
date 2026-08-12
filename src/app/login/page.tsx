'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * A TEST-SUPPORT AFFORDANCE, the same one `RecordForm` and
   * `CollectionFilters` carry, and the highest-leverage of the three.
   *
   * This form is CONTROLLED: `onSubmit` reads `password` from React state. A
   * value typed into the DOM before hydration never reaches that state, so the
   * submit sees `''` and renders "Enter the password" — the field looks filled
   * and the login fails.
   *
   * Waiting for the rendered input does not help: it is server-rendered, so its
   * presence proves the markup arrived, not that React is listening. This
   * attribute appears only after an effect runs, which is only after hydration.
   *
   * Every spec's `login()` goes through here, so when the race fires it fails
   * whole FILES at once and each failure names whatever feature that spec was
   * about. One run produced 33 identical `toHaveURL` failures across 8 files,
   * none of them related to the features they named.
   */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // The DOM attribute IS the external system, which is the legitimate use of
    // an effect named by react-hooks/set-state-in-effect. Setting it directly
    // also avoids a render purely to publish a flag no React code reads.
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password === '') {
      setError('Enter the password.');
      return;
    }

    setPending(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? ((body as { error?: { message?: string } }).error?.message ?? 'Incorrect password')
          : 'Incorrect password';
      setError(message);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Record Collection</h1>
        <p className="mb-6 text-sm text-muted-foreground">Enter the password to continue.</p>

        <form ref={formRef} onSubmit={onSubmit} noValidate>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : 'password-error'}
            className="mb-4 h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />

          {error !== null && (
            <p id="password-error" role="alert" className="mb-4 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Disabled only while a request is in flight. Gating on an empty
              field would depend on React state that some browsers do not
              update from programmatic input, and the server validates anyway. */}
          <Button type="submit" disabled={pending} className="h-11 w-full">
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
