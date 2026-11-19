import { NextResponse } from 'next/server';
import { newChallenge } from '@/lib/robot';

/** A fresh robot check for the website's forms (the pages are static, so the form asks for one when it appears). */
export const dynamic = 'force-dynamic';
export function GET() {
  const c = newChallenge();
  return NextResponse.json(c ? { token: c.token, target: c.target, options: c.options } : { unavailable: true }, {
    status: c ? 200 : 503,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
