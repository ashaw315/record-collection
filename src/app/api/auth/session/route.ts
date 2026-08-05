import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getEnv } from '@/env';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await verifySessionToken(token, getEnv().SESSION_SECRET);

  return NextResponse.json({ authenticated });
}
