# Player guide (PDF)

One A4 page per language that tells players how to create an account, sign in, agree to the Code of Conduct, sign the
contract and pay the membership fee. The PDFs are in `apps/app/public/guides/player-guide-<lang>.pdf` and are offered on
the admin and coach home pages (`PlayerGuideCard`). They hold no personal data and open without signing in.

The text is in `build.py` (one block per language). Button and tab names must match the app's own texts
(`packages/i18n/src/messages/*.json`: `auth`, `conduct`, `contract`, `me`).

## Rebuild after a text change

```bash
W=$(mktemp -d)
(cd "$W" && npm pack @fontsource/figtree@5.1.1 @fontsource/cairo@5.1.1 --silent \
  && mkdir -p fonts && for p in figtree cairo; do mkdir -p x && tar xzf fontsource-$p-5.1.1.tgz -C x && mv x/package/files fonts/$p && rm -rf x; done)
python3 -c "from PIL import Image; im=Image.open('apps/app/public/afc-logo.png'); im.thumbnail((240,340)); im.save('$W/logo.png')"
python3 scripts/player-guide/build.py "$W"
node scripts/player-guide/pdf.cjs "$W" apps/app/public/guides
```

`pdf.cjs` needs Playwright with Chromium and fails if a language no longer fits on one page.
