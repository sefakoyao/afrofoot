/**
 * Renders the Code of Conduct text stored in the database: "## " starts a section, "- " a list item, other lines are paragraphs.
 * Plain React elements only (no HTML from the database is injected). Each section gets an anchor for jump links:
 * #players, #spectators and #coaches for the audience sections (found by their heading), #section-N for the others.
 */
type Block = { kind: 'h' | 'p' | 'ul'; lines: string[]; id?: string };

const AUDIENCES: [RegExp, string][] = [[/\bplayers?\b/i, 'players'], [/\bspectators?\b/i, 'spectators'], [/\bcoach(es)?\b/i, 'coaches']];

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  const used = new Set<string>();
  let n = 0;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      const title = line.slice(3);
      n += 1;
      const hit = AUDIENCES.find(([re, id]) => re.test(title) && !used.has(id))?.[1];
      const id = hit ?? `section-${n}`;
      used.add(id);
      blocks.push({ kind: 'h', lines: [title], id });
    } else if (line.startsWith('- ')) {
      const last = blocks.at(-1);
      if (last?.kind === 'ul') last.lines.push(line.slice(2)); else blocks.push({ kind: 'ul', lines: [line.slice(2)] });
    } else blocks.push({ kind: 'p', lines: [line] });
  }
  return blocks;
}

/** The sections, for a table of contents. */
export const conductSections = (body: string) => parse(body).filter((b) => b.kind === 'h').map((b) => ({ id: b.id!, title: b.lines[0]! }));

export function ConductText({ body }: { body: string }) {
  return (
    <div className="grid gap-3 leading-relaxed" lang="en" dir="ltr">
      {parse(body).map((b, i) => b.kind === 'h'
        ? <h2 key={i} id={b.id} className="mt-4 scroll-mt-6 font-display text-lg font-extrabold">{b.lines[0]}</h2>
        : b.kind === 'ul'
          ? <ul key={i} className="grid list-disc gap-1.5 ps-6">{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
          : <p key={i}>{b.lines[0]}</p>)}
    </div>
  );
}

/** Jump links: "Your section" first (players or coaches), then every section, then "I agree" at the bottom. */
export function ConductContents({ body, mine, labels }: { body: string; mine: 'players' | 'coaches'; labels: { title: string; mine: string; agree: string } }) {
  const sections = conductSections(body);
  const own = sections.find((s) => s.id === mine);
  return (
    <nav aria-label={labels.title} className="mt-4 grid gap-3 rounded-card border border-line bg-surface p-4" data-conduct-contents>
      <div className="flex flex-wrap gap-2">
        {own ? <a href={`#${own.id}`} data-jump={own.id} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{labels.mine} ↓</a> : null}
        <a href="#agree" data-jump="agree" className="inline-flex min-h-11 items-center rounded-full border-2 border-fg px-5 font-display font-bold hover:bg-fg hover:text-raised">{labels.agree} ↓</a>
      </div>
      {sections.length > 1 ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">{labels.title}</summary>
          <ol className="mt-2 grid gap-1 text-sm" lang="en" dir="ltr">
            {sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-pitch underline underline-offset-2">{s.title}</a></li>)}
          </ol>
        </details>
      ) : null}
    </nav>
  );
}
