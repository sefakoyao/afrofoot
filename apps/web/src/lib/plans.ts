import { getPublicClient } from './supabase';

export type PlanCode = 'm' | 'q' | 'y';
export interface Plan { code: PlanCode; id: string | null; name: string; amountEur: number }

// Names as seeded in migration 0017. Amounts are read from the database when it is reachable.
const BASE: Record<PlanCode, { name: string; amountEur: number }> = {
  m: { name: 'Monthly', amountEur: 20 },
  q: { name: 'Quarterly', amountEur: 60 },
  y: { name: 'Yearly', amountEur: 240 },
};

export async function getPlans(): Promise<Plan[]> {
  const db = getPublicClient();
  const rows = db ? (await db.from('public_membership_plans').select('id,name,amount_cents')).data ?? [] : [];
  return (Object.keys(BASE) as PlanCode[]).map((code) => {
    const row = rows.find((r: { name: string }) => r.name === BASE[code].name) as { id: string; amount_cents: number } | undefined;
    return { code, id: row?.id ?? null, name: BASE[code].name, amountEur: row ? row.amount_cents / 100 : BASE[code].amountEur };
  });
}

export async function planId(code: PlanCode): Promise<string | null> {
  return (await getPlans()).find((p) => p.code === code)?.id ?? null;
}
