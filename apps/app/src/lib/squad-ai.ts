import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { DRAFT_MODEL, draftingAvailable } from '@/lib/content/draft';

/**
 * "Analyse the squad" (Squad planner, migration 0076): Claude reads the plan as numbers only. Players are codes (P1, P2 …),
 * with position, age, outlook for the season, training attendance and Palloliitto games and goals: no names, contact
 * details or notes leave the club. The app puts the names back on screen. The answer is structured and validated.
 */
export const Analysis = z.object({
  summary: z.string().describe('Two or three sentences on the state of the squad for the season'),
  strengths: z.array(z.string()).describe('Up to 4 short points'),
  gaps: z.array(z.string()).describe('Up to 5 short points: positions to strengthen, with how many players'),
  recruit: z.array(z.string()).describe('Up to 5 concrete recruiting or development actions, mentioning player codes where useful'),
  risks: z.array(z.string()).describe('Up to 4 short points: depth, contracts, age, unsure starters'),
});
export type Analysis = z.infer<typeof Analysis>;

const SYSTEM = `You help an amateur football club in Helsinki plan next season's squad. You get the planned formation, each place's
starter and back-ups, and every player as a code (P1, P2, …) with position, second position, age, outlook (confirmed, likely,
unsure, leaving, target = a try-out or join applicant), training attendance and official league games and goals.
Write practical advice for the coaches in clear, simple English: short points, no jargon. Refer to players only by their
codes. Do not invent facts that are not in the data; when something is unknown, say so. Amateur level: playing time, training
commitment and squad depth matter more than star quality.`;

let client: Anthropic | null = null;
export const analysisAvailable = draftingAvailable;

export async function analyseSquad(facts: unknown): Promise<{ analysis: Analysis } | { error: string }> {
  if (!analysisAvailable()) return { error: 'no_key' };
  client ??= new Anthropic({ apiKey: (process.env['ANTHROPIC' + '_API_KEY'] ?? '').trim() });
  try {
    const res = await client.beta.messages.parse({
      model: DRAFT_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: zodOutputFormat(Analysis) },
      messages: [{ role: 'user', content: `Squad plan (JSON):\n${JSON.stringify(facts)}` }],
    });
    if (res.stop_reason === 'refusal') return { error: 'refused' };
    const parsed = Analysis.safeParse(res.parsed_output);
    return parsed.success ? { analysis: parsed.data } : { error: 'invalid' };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: 'bad_key' };
    if (e instanceof Anthropic.RateLimitError) return { error: 'busy' };
    console.error('[squad] analysis failed', { message: e instanceof Error ? e.message : String(e) });
    return { error: 'api' };
  }
}
