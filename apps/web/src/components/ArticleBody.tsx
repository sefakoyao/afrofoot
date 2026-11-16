import type { ReactNode } from 'react';

/**
 * News article text: a small, safe subset of Markdown, rendered as React elements only (no HTML from the database).
 *  - blocks separated by a blank line; "## " heading; "> " quote; a block that is only ![alt](src) is a picture
 *  - inside a block: **bold**, [text](https://… or /path) links, line breaks
 * Pictures and links are only accepted from the site itself (/…) or https addresses.
 */
const SAFE_URL = /^(https:\/\/|\/(?!\/))/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // **bold** or [text](url)
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${n++}`;
    if (m[1] !== undefined) out.push(<strong key={key}>{inline(m[1], key)}</strong>);
    else if (SAFE_URL.test(m[3]!)) {
      const external = m[3]!.startsWith('https://');
      out.push(<a key={key} href={m[3]} className="font-semibold text-pitch underline underline-offset-2" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{m[2]}</a>);
    } else out.push(m[2]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const withBreaks = (text: string, key: string) =>
  text.split('\n').flatMap((line, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(line, `${key}-${i}`)] : inline(line, `${key}-${i}`)));

export function ArticleBody({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="mt-6 grid gap-4 text-lg leading-relaxed" data-article-body>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        const img = b.match(IMAGE);
        if (img) {
          return SAFE_URL.test(img[2]!)
            // eslint-disable-next-line @next/next/no-img-element -- article pictures of any size; already resized when imported
            ? <figure key={key} className="overflow-hidden rounded-card"><img src={img[2]} alt={img[1] ?? ''} loading="lazy" className="w-full" /></figure>
            : null;
        }
        // dir="auto": each block follows its own text, so English articles read correctly on the Arabic site
        if (b.startsWith('## ')) return <h2 key={key} dir="auto" className="mt-2 font-display text-2xl font-extrabold">{inline(b.slice(3), key)}</h2>;
        if (b.startsWith('> ')) return <blockquote key={key} dir="auto" className="border-s-4 border-accent ps-4 italic">{withBreaks(b.split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n'), key)}</blockquote>;
        return <p key={key} dir="auto">{withBreaks(b, key)}</p>;
      })}
    </div>
  );
}
