/**
 * Campaign tags on the club's own links in a social post, added when the post is sent (the stored text keeps the plain
 * link): utm_source = the platform, utm_medium = social, utm_campaign = the article (the last part of the address).
 * The website's statistics then show how many visits each platform and each post brought. Other sites' links are left
 * alone; a link that already has utm tags too.
 */
const CLUB = /https:\/\/(?:www\.)?afrofoot\.club(?:\/[^\s)<>"']*)?/g;

export function tagLinks(caption: string, platform: string): string {
  return caption.replace(CLUB, (link) => {
    const trail = /[.,!?;:]+$/.exec(link)?.[0] ?? '';   // punctuation that ends the sentence, not the address
    const raw = trail ? link.slice(0, -trail.length) : link;
    try {
      const u = new URL(raw);
      if ([...u.searchParams.keys()].some((k) => k.startsWith('utm_'))) return link;
      const campaign = u.pathname.split('/').filter(Boolean).pop() || 'club';
      u.searchParams.set('utm_source', platform);
      u.searchParams.set('utm_medium', 'social');
      u.searchParams.set('utm_campaign', campaign.slice(0, 80));
      return u.toString() + trail;
    } catch {
      return link;
    }
  });
}
