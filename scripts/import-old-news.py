#!/usr/bin/env python3
"""
One-off import of the old WordPress news (afrofoot.club) into the new website.

Input : the WordPress REST export (wp-json/wp/v2/posts?per_page=100&_embed=wp:featuredmedia), saved as JSON.
Output: - pictures resized for the web in apps/web/public/news/<slug>/ (cover.jpg, 1.jpg, 2.jpg …), shipped with the site,
        - supabase/content/news_import_old_site.sql: one insert per article (Markdown text, cover path, original date),
          "on conflict (slug) do nothing" so it is safe to run twice and never overwrites an article edited later.
The Markdown uses only what the website renders (apps/web/src/components/ArticleBody.tsx): paragraphs, "## " headings,
"> " quotes, **bold**, [links](https://…) and pictures ![](/news/…). Videos become links. No HTML is kept.

Usage: python3 scripts/import-old-news.py posts.json   (downloads the pictures from afrofoot.club)
"""
import html, io, json, re, sys, urllib.parse, urllib.request
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Tag
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'apps/web/public/news'
SQL = ROOT / 'supabase/content/news_import_old_site.sql'
UA = {'User-Agent': 'Mozilla/5.0 (club website import)'}

def fetch(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()

def save_picture(url: str, dest: Path, max_w: int) -> bool:
    """Download, convert to JPEG (white behind transparency), at most max_w wide, quality 80."""
    try:
        im = Image.open(io.BytesIO(fetch(url)))
    except Exception as e:  # noqa: BLE001
        print('  ! picture not loaded:', url, e); return False
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[-1]); im = bg
    else:
        im = im.convert('RGB')
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, 'JPEG', quality=80, optimize=True, progressive=True)
    return True

def clean_url(href: str, slugs: set[str]) -> str | None:
    """Keep https links without tracking; old site links → new news paths; Facebook hashtag/search links dropped."""
    href = html.unescape(href or '').strip()
    if not href:
        return None
    u = urllib.parse.urlparse(href)
    if u.netloc.endswith('afrofoot.club'):
        parts = [p for p in u.path.split('/') if p]
        if parts and parts[-1] in slugs:
            return f'/news/{parts[-1]}'
        return None
    if u.scheme != 'https':
        return None
    if 'facebook.com' in u.netloc and (u.path.startswith('/hashtag/') or u.path.startswith('/search/')):
        return None
    q = [(k, v) for k, v in urllib.parse.parse_qsl(u.query) if not k.startswith('__') and k not in ('fbclid', 'utm_source', 'utm_medium', 'utm_campaign')]
    return urllib.parse.urlunparse(u._replace(query=urllib.parse.urlencode(q), fragment=''))

def video_link(src: str) -> str | None:
    src = html.unescape(src)
    m = re.search(r'youtube\.com/embed/([\w-]{6,})', src)
    if m:
        return f'[Watch the video on YouTube](https://www.youtube.com/watch?v={m.group(1)})'
    if 'facebook.com/plugins/video.php' in src:
        href = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(src).query)).get('href')
        if href and href.startswith('https://'):
            return f'[Watch the video on Facebook]({href})'
    return None

BLOCKS = ['p', 'div', 'section', 'header', 'article', 'figure', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'table']

def is_emoji(img: Tag) -> bool:
    """Emoji pasted from Facebook or WordPress come as tiny pictures whose alt text is the emoji itself."""
    src = img.get('src') or ''
    return 'emoji.php' in src or 's.w.org/images/core/emoji' in src or 'emoji' in (img.get('class') or [])

def text_of(node, slugs) -> str:
    """Inline Markdown of a node: bold and links kept; line breaks as newlines."""
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            out.append(re.sub(r'\s+', ' ', str(c)))
        elif isinstance(c, Tag):
            if c.name == 'br':
                out.append('\n')
            elif c.name in ('strong', 'b'):
                t = text_of(c, slugs).strip()
                out.append(f'**{t}**' if t else '')
            elif c.name == 'a':
                t = text_of(c, slugs).strip(); href = clean_url(c.get('href'), slugs)
                out.append(f'[{t}]({href})' if t and href and '](' not in t else t)
            elif c.name == 'img' and is_emoji(c):
                out.append(c.get('alt') or '')
            elif c.name in ('img', 'iframe', 'script', 'style'):
                continue
            else:
                out.append(text_of(c, slugs))
    return ''.join(out)

def to_markdown(content: str, slug: str, slugs: set[str], pictures: list[str], cover_src: str | None) -> str:
    soup = BeautifulSoup(content, 'html.parser')
    blocks: list[str] = []
    def flush(t: str, prefix: str = ''):
        t = '\n'.join(l.strip() for l in t.replace('\xa0', ' ').replace('​', '').split('\n'))
        t = re.sub(r'\n{2,}', '\n', t).strip()
        if t:
            blocks.append(prefix + t if not prefix else '\n'.join(prefix + l for l in t.split('\n')))
    def walk(node):
        for c in node.children:
            if isinstance(c, NavigableString):
                flush(str(c)); continue
            if not isinstance(c, Tag):
                continue
            if c.name == 'img' and is_emoji(c):
                blocks.append(c.get('alt') or '') if c.get('alt') else None
            elif c.name == 'img':
                src = c.get('src') or ''
                if src and src.split('?')[0] != (cover_src or '').split('?')[0]:
                    pictures.append(src); blocks.append(f'![{(c.get("alt") or "").strip()}](/news/{slug}/{len(pictures)}.jpg)')
            elif c.name == 'iframe':
                v = video_link(c.get('src') or '')
                if v: blocks.append(v)
            elif c.name in ('h1', 'h2', 'h3', 'h4'):
                flush(text_of(c, slugs), '## ')
            elif c.name == 'blockquote':
                flush(text_of(c, slugs), '> ')
            elif c.name in ('p', 'li', 'figcaption'):
                if any(not is_emoji(m) for m in c.find_all('img')) or c.find('iframe'):
                    before = len(blocks); inner = BeautifulSoup('', 'html.parser')
                    flush(text_of(c, slugs)); walk_media(c)
                else:
                    flush(text_of(c, slugs))
            elif c.name in ('div', 'section', 'header', 'figure', 'article', 'ul', 'ol'):
                # a box without paragraphs inside is one paragraph (Facebook pastes wrap words in many boxes)
                if c.find(BLOCKS):
                    walk(c)
                else:
                    flush(text_of(c, slugs)); walk_media(c)
            elif c.name in ('script', 'style'):
                continue
            else:
                flush(text_of(c, slugs))
    def walk_media(node):
        for m in node.find_all(['img', 'iframe']):
            if m.name == 'img' and is_emoji(m):
                continue
            if m.name == 'img':
                src = m.get('src') or ''
                if src and src.split('?')[0] != (cover_src or '').split('?')[0]:
                    pictures.append(src); blocks.append(f'![{(m.get("alt") or "").strip()}](/news/{slug}/{len(pictures)}.jpg)')
            else:
                v = video_link(m.get('src') or '')
                if v: blocks.append(v)
    walk(soup)
    # drop exact repeats (page builders often repeat blocks)
    seen, out = set(), []
    for b in blocks:
        if b not in seen:
            seen.add(b); out.append(b)
    return '\n\n'.join(out)

def sql_str(s: str | None) -> str:
    return 'null' if s is None else "'" + s.replace("'", "''") + "'"

def main(path: str):
    posts = json.load(open(path))
    slugs = {p['slug'] for p in posts}
    rows = []
    for p in sorted(posts, key=lambda x: x['date_gmt']):
        slug = p['slug']
        title = html.unescape(BeautifulSoup(p['title']['rendered'], 'html.parser').get_text()).strip()
        fm = (p.get('_embedded', {}).get('wp:featuredmedia') or [{}])[0]
        cover_src = fm.get('source_url')
        cover_path = None
        if cover_src and save_picture(cover_src, PUBLIC / slug / 'cover.jpg', 1600):
            cover_path = f'/news/{slug}/cover.jpg'
        pictures: list[str] = []
        body = to_markdown(p['content']['rendered'], slug, slugs, pictures, cover_src)
        for i, src in enumerate(pictures, 1):
            if not save_picture(src, PUBLIC / slug / f'{i}.jpg', 1200):
                body = body.replace(f'(/news/{slug}/{i}.jpg)', '(missing)')
        body = '\n\n'.join(b for b in body.split('\n\n') if '(missing)' not in b)
        excerpt = re.sub(r'\s+', ' ', html.unescape(BeautifulSoup(p['excerpt']['rendered'], 'html.parser').get_text())).strip()
        excerpt = re.sub(r'\s*(\[…\]|…|\.\.\.)$', '…', excerpt)
        if len(excerpt) > 300:
            excerpt = excerpt[:297].rsplit(' ', 1)[0] + '…'
        rows.append((slug, title, excerpt or None, body, cover_path, p['date_gmt'] + 'Z'))
        print(f'{p["date"][:10]} {slug[:50]:50} pictures: {len(pictures)} {"cover" if cover_path else "no cover"}')
    SQL.parent.mkdir(parents=True, exist_ok=True)
    with open(SQL, 'w') as f:
        f.write('-- News articles from the old website (afrofoot.club, WordPress), imported once. Generated by scripts/import-old-news.py.\n')
        f.write('-- Paste into Supabase → SQL Editor and run. Safe to run again: existing articles (same slug) are left as they are.\n')
        f.write('-- Pictures are part of the website (apps/web/public/news/…); the original dates are kept.\n\n')
        for slug, title, excerpt, body, cover_path, published in rows:
            f.write('insert into news_posts (slug, title, excerpt, body_md, cover_path, status, published_at) values (\n')
            f.write(f'  {sql_str(slug)}, {sql_str(title)}, {sql_str(excerpt)},\n  {sql_str(body)},\n  {sql_str(cover_path)}, \'published\', {sql_str(published)})\n')
            f.write('on conflict (slug) do nothing;\n\n')
        f.write(f"select count(*) as imported_articles from news_posts where slug in ({', '.join(sql_str(r[0]) for r in rows)});\n")
    print(f'\n{len(rows)} articles → {SQL.relative_to(ROOT)}')

if __name__ == '__main__':
    main(sys.argv[1])
