/**
 * Renders the Code of Conduct text stored in the database: "## " starts a section, "- " a list item, other lines are paragraphs.
 * Plain React elements only (no HTML from the database is injected).
 */
export function ConductText({ body }: { body: string }) {
  const blocks: { kind: 'h' | 'p' | 'ul'; lines: string[] }[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) blocks.push({ kind: 'h', lines: [line.slice(3)] });
    else if (line.startsWith('- ')) {
      const last = blocks.at(-1);
      if (last?.kind === 'ul') last.lines.push(line.slice(2)); else blocks.push({ kind: 'ul', lines: [line.slice(2)] });
    } else blocks.push({ kind: 'p', lines: [line] });
  }
  return (
    <div className="grid gap-3 leading-relaxed" lang="en" dir="ltr">
      {blocks.map((b, i) => b.kind === 'h'
        ? <h2 key={i} className="mt-4 font-display text-lg font-extrabold">{b.lines[0]}</h2>
        : b.kind === 'ul'
          ? <ul key={i} className="grid list-disc gap-1.5 ps-6">{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
          : <p key={i}>{b.lines[0]}</p>)}
    </div>
  );
}
