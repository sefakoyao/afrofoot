import { NextResponse } from 'next/server';
import { findAndDraft } from '@/lib/content/run';
import { serviceClient } from '@/lib/supabase/service';

/**
 * Scheduled job (vercel.json crons): finds new topics and drafts suggestions for the approvers (migration 0064).
 * Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused. Never publishes anything itself.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const r = await findAndDraft(db, 5);
  return NextResponse.json(r, { status: r.error && !r.drafted ? 500 : 200 });
}
