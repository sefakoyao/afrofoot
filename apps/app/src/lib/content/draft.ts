import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';

/**
 * Drafts one article and its social media posts with Claude (migration 0064). Claude only gets the facts the database
 * found (public_name: players' names only with their consent); it is told not to add anything else and to list what an
 * approver should check. The answer is structured JSON (structured outputs), validated before it is saved.
 * Needs ANTHROPIC_API_KEY (server-side only, never sent to the browser).
 */
export const DRAFT_MODEL = 'claude-opus-5-5';

const lang = (min: number, max: number) => z.string().min(min).max(max);
export const Draft = z.object({
  title_en: lang(3, 120), excerpt_en: lang(10, 280), body_en: lang(150, 6000),
  title_fi: lang(3, 120), excerpt_fi: lang(10, 280), body_fi: lang(150, 6000),
  title_fr: lang(3, 120), excerpt_fr: lang(10, 280), body_fr: lang(150, 6000),
  title_ar: lang(3, 120), excerpt_ar: lang(10, 280), body_ar: lang(150, 6000),
  facebook: lang(20, 1500), instagram: lang(20, 2000), tiktok: lang(10, 900),
  checks: z.array(z.string().max(200)).max(8),
});
export type Draft = z.infer<typeof Draft>;

const KIND_BRIEF: Record<string, string> = {
  match_report: 'A match report: the result, how the goals came (minutes, scorers when named), and a positive word for the team. If a scorer is null, write "a player" - never guess a name.',
  match_preview: 'A match preview: who, when, where, home or away, and an invitation to come and support. Mention recent form only from last_results.',
  event: 'An announcement of a club event: what, when, where, for whom, and how to join if the description says so.',
  new_player: 'A welcome article for a newly signed player: name, position, contract length, and a warm welcome from the club.',
  new_sponsor: 'A thank-you article for a new sponsor: who they are (from the description only) and a thank-you from the club.',
  monthly_recap: 'A monthly recap: the games and results, the events and the number of new players, in a short, upbeat summary.',
};

// Stable (cached) instructions: the club's voice and the rules; the facts come in the user message.
const SYSTEM = `You write news for Afro Foot Club, an amateur football club in Helsinki, Finland, open to everyone and proud of its African roots and diversity.
Write warm, clear and short texts for the club's website and social media.

Rules:
- Use only the facts you are given. Do not invent results, names, quotes, numbers, opponents' details or anything else.
- If something important is missing or unclear, write around it and add a short note to "checks" for the person approving (in English).
- Never name a player whose name is null in the facts.
- Website article: title, a one or two sentence excerpt, and a body in Markdown of 120-300 words, in English (en), Finnish (fi), French (fr) and Arabic (ar). Each language is a natural text in that language, not a word-for-word translation.
- Social media posts are bilingual, Finnish first, then English, separated by an empty line:
  - facebook: 2-4 sentences per language, ending with the article link written exactly as {link}.
  - instagram: 2-3 sentences per language, then "Linkki biossa / Link in bio", then 5-10 hashtags including #afrofootclub and #helsinki. No link.
  - tiktok: one short line per language and 3-6 hashtags including #afrofootclub. No link.
- Use emojis sparingly (at most 2 per post). No hashtags in the website article.`;

let client: Anthropic | null = null;
export const draftingAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export async function draftArticle(kind: string, facts: unknown, today: string): Promise<{ draft: Draft; model: string } | { error: string }> {
  if (!draftingAvailable()) return { error: 'no_key' };
  client ??= new Anthropic();
  try {
    const res = await client.beta.messages.parse({
      model: DRAFT_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // a declined request is retried server-side on the recommended model
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: zodOutputFormat(Draft) },
      messages: [{ role: 'user', content: `Today is ${today}. Topic: ${kind}. ${KIND_BRIEF[kind] ?? ''}\n\nFacts (JSON):\n${JSON.stringify(facts, null, 2)}` }],
    });
    if (res.stop_reason === 'refusal') return { error: 'refused' };
    if (res.stop_reason === 'max_tokens') return { error: 'too_long' };
    const parsed = Draft.safeParse(res.parsed_output);
    if (!parsed.success) return { error: 'invalid' };
    return { draft: parsed.data, model: res.model };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: 'bad_key' };
    if (e instanceof Anthropic.RateLimitError) return { error: 'busy' };
    if (e instanceof Anthropic.APIError) { console.error('[content] Claude refused the request', { status: e.status, message: e.message }); return { error: 'api' }; }
    console.error('[content] drafting failed', { message: e instanceof Error ? e.message : String(e) });
    return { error: 'api' };
  }
}
