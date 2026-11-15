import { NextResponse, type NextRequest } from 'next/server';
import { getMember } from '@/lib/auth';
import { loadBilling, loadInvoice } from '@/lib/invoice/data';
import { renderInvoicePdf } from '@/lib/invoice/pdf';
import { getSupabase } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Invoice PDF. Signed-in only; the database decides who may see which invoice (the player it belongs to, and admins). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await getMember();
  if (!member || member.status !== 'active') return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/invoices/${id}`)}`, request.nextUrl.origin));
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await getSupabase();
  if (!supabase) return new NextResponse('Not available', { status: 503 });
  const origin = (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, '');
  const invoice = await loadInvoice(supabase, id, `${origin}/me/membership`);
  if (!invoice) return new NextResponse('Not found', { status: 404 });
  const pdf = await renderInvoicePdf(await loadBilling(supabase), invoice);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="INVOICE_${invoice.number.replace(/[^A-Za-z0-9-]/g, '')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
