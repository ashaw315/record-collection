import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/env';
import { verifyPassword } from '@/lib/auth/password';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
} from '@/lib/auth/session';

const loginSchema = z.strictObject({ password: z.string().min(1) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: 'Request body must be valid JSON', code: 'INVALID_JSON' } },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      if (field !== '') fieldErrors[field] = issue.message;
    }
    return NextResponse.json(
      { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
      { status: 400 },
    );
  }

  const env = getEnv();
  const ok = await verifyPassword(parsed.data.password, env.APP_PASSWORD_HASH);

  if (!ok) {
    // Deliberately vague: never reveal whether the hash is misconfigured or the
    // password merely wrong.
    return NextResponse.json(
      { error: { message: 'Incorrect password', code: 'INVALID_CREDENTIALS' } },
      { status: 401 },
    );
  }

  const token = await createSessionToken(env.SESSION_SECRET);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(env.NODE_ENV));
  return response;
}
