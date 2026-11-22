import { NextResponse } from 'next/server';
import { publishDue } from '@/lib/social/publish';
import { serviceClient } from '@/lib/supabase/service';

/**
 * Sends the social posts that are due (migration 0071). Called every 10 minutes by Supabase (pg_cron, Vault secret
 * "cron_secret") and once a day by Vercel Cron, both with "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const r = await publishDue(db, 5);
  return NextResponse.json(r, { status: r.error ? 500 : 200 });
}
