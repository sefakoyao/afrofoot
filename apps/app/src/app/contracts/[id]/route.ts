import { NextResponse, type NextRequest } from 'next/server';
import { getMember } from '@/lib/auth';
import { renderContractPdf } from '@/lib/contract-pdf';
import { CONTRACT_COLUMNS, type Contract } from '@/lib/contracts';
import { loadBilling } from '@/lib/invoice/data';
import { getSupabase } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Contract PDF. Signed-in only; the database decides who may read it (the player once sent, and admins; never coaches). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await getMember();
  if (!member || member.status !== 'active') return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/contracts/${id}`)}`, request.nextUrl.origin));
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await getSupabase();
  if (!supabase) return new NextResponse('Not available', { status: 503 });
  const { data } = await supabase.from('player_contracts').select(`${CONTRACT_COLUMNS}, players!inner(first_name, last_name)`).eq('id', id).maybeSingle();
  if (!data) return new NextResponse('Not found', { status: 404 });
  const c = data as unknown as Contract & { players: { first_name: string; last_name: string } };
  const billing = await loadBilling(supabase);
  const footer = [billing.legal_name || 'Afro Foot Club', [billing.street, billing.postal_city].filter(Boolean).join(', '),
    billing.business_id ? `Business ID ${billing.business_id}` : '', billing.email, billing.phone, billing.website];
  const pdf = await renderContractPdf(c, `${c.players.first_name} ${c.players.last_name}`, billing.legal_name || 'Afro Foot Club', footer);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="CONTRACT_${c.starts_on.slice(0, 4)}_${id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
