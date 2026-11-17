import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TorneopalClient, syncFromSettings } from '@afrofoot/federation';
import { keyFacts, keyKind } from '@/lib/supabase-key';

/**
 * League tables and results from the Palloliitto results service (migration 0040). Called by Vercel Cron (vercel.json)
 * with `Authorization: Bearer <CRON_SECRET>`; nothing else can start it. Server-only secrets: TORNEOPAL_API_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET. Every run is recorded in sync_runs; errors never contain a key.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  return secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  // A value pasted with a space or line break around it still works; the facts in an error describe the raw value.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, rawService = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', service = rawService.trim();
  if (!url || !service) return NextResponse.json({ ok: false, error: 'database not configured' }, { status: 503 });
  if (keyKind(service) === 'public') {
    return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY holds the public (anon / publishable) key: use the service_role (secret) key from Supabase → Project Settings → API' }, { status: 503 });
  }
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!process.env.TORNEOPAL_API_KEY?.trim()) return NextResponse.json({ ok: false, error: 'TORNEOPAL_API_KEY is not set in this Vercel project' }, { status: 503 });
  const out = await syncFromSettings(db, TorneopalClient.fromEnv({ ...process.env, TORNEOPAL_API_KEY: process.env.TORNEOPAL_API_KEY.trim() }), process.env.TORNEOPAL_API_KEY.trim());
  if (out.ok) return NextResponse.json(out);
  // A wrong key or project shows up as unreadable or missing settings: say so instead of reporting the sync as switched off.
  if (out.reason === 'settings_unreadable') {
    return NextResponse.json({ ok: false, error: `could not read the settings (${out.error}): check SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL`, key: keyFacts(rawService, url) }, { status: 503 });
  }
  if (out.reason === 'settings_missing') return NextResponse.json({ ok: false, error: 'no federation settings found: run migration 0040 in this Supabase project, or check that SUPABASE_SERVICE_ROLE_KEY is the service_role key of the same project as NEXT_PUBLIC_SUPABASE_URL' }, { status: 503 });
  if (out.reason === 'no_team') return NextResponse.json({ ok: false, error: 'site_settings "federation" has no team_ids: add the club team id (35118195)' }, { status: 503 });
  console.error('[federation-sync] failed:', out.error);
  return NextResponse.json({ ok: false, error: out.error }, { status: 502 });
}
