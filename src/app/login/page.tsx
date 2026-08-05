'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

        <form onSubmit={onSubmit} noValidate>
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
