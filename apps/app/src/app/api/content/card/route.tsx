import type { NextRequest } from 'next/server';
import { cardImage } from '@/lib/content/card';

/**
 * The club's branded picture for a social post, for the previews on the review page (lib/content/card.tsx).
 * Text only comes from the query (?t= headline, ?k= kind label, ?s= score, ?tall=1), cut to a safe length.
 */
export const runtime = 'edge';

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return cardImage({ title: q.get('t') ?? '', kind: q.get('k') ?? '', score: q.get('s') ?? '', tall: q.get('tall') === '1' });
}
