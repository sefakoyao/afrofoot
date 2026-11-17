const { chromium } = require('playwright');
// Turns the HTML from build.py into apps/app/public/guides/player-guide-<lang>.pdf and checks each fits one A4 page.
const NAMES = { en: 'player-guide-en', fi: 'player-guide-fi', fr: 'player-guide-fr', ar: 'player-guide-ar' };
(async () => { const G = process.argv[2], OUT = process.argv[3]; const b = await chromium.launch();
  for (const l of Object.keys(NAMES)) {
    const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await p.goto('file://' + G + '/guide-B-' + l + '.html'); await p.evaluate(() => document.fonts.ready);
    const fit = await p.evaluate(() => { const pg = document.querySelector('.page').getBoundingClientRect(); const m = document.querySelector('main'), a = document.querySelector('aside');
      const f = m.querySelector('footer').getBoundingClientRect().top, al = m.querySelector('.alert').getBoundingClientRect().bottom;
      return { gapAboveFooter: Math.round(f - al), asideOverflow: a.scrollHeight > a.clientHeight + 1, mainOverflow: m.scrollHeight > pg.height + 1 }; });
    if (fit.gapAboveFooter < 0 || fit.asideOverflow || fit.mainOverflow) { console.error(l, 'does not fit one page:', JSON.stringify(fit)); process.exitCode = 1; }
    await p.pdf({ path: OUT + '/' + NAMES[l] + '.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log(l, JSON.stringify(fit)); await p.close(); }
  await b.close(); })();
