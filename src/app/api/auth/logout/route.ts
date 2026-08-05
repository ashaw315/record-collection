import { NextResponse } from 'next/server';
import { getEnv } from '@/env';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...sessionCookieOptions(getEnv().NODE_ENV),
    maxAge: 0,
  });

  return response;
}
