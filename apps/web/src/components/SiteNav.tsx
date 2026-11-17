'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { LOCALES, LOCALE_LABELS } from '@afrofoot/i18n';
import { Link, usePathname } from '@/i18n/routing';
import { LanguageSwitcher } from './LanguageSwitcher';

export type NavItem = { href: string; label: string; desc: string };
export type NavGroup = { id: string; label: string; items: NavItem[] };
type Labels = { menu: string; close: string; home: string; signin: string; language: string };

const Caret = ({ open }: { open?: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);

const pathOf = (href: string) => href.split('#')[0] || '/';

function Logo({ label, small }: { label: string; small?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-3" aria-label={label}>
      <Image src="/afc-logo.png" alt="" width={small ? 28 : 34} height={small ? 40 : 48} priority />
      <span className="font-display text-lg font-extrabold leading-tight max-[359px]:sr-only">Afro Foot<br />Club</span>
    </Link>
  );
}

/**
 * Website main menu: four groups that open a drop-down (desktop) or fold out in a full-screen panel (phones).
 * Click or Enter opens a group, arrow keys move through it, Esc or a click outside closes it.
 */
export function SiteNav({ groups, labels, appUrl }: { groups: NavGroup[]; labels: Labels; appUrl?: string }) {
  const pathname = usePathname();
  const locale = useLocale();
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [fold, setFold] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuBtn = useRef<HTMLButtonElement>(null);

  const activeGroup = groups.find((g) => g.items.some((i) => pathOf(i.href) !== '/' && pathname.startsWith(pathOf(i.href))))?.id;

  // Close everything when the page changes.
  useEffect(() => { setOpen(null); setPanel(false); }, [pathname]);

  // Click outside or Esc closes the open drop-down.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!navRef.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { btnRefs.current[open]?.focus(); setOpen(null); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Phone panel: lock the page behind it, Esc closes it.
  useEffect(() => {
    if (!panel) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setFold((f) => f ?? activeGroup ?? null);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setPanel(false); menuBtn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [panel, activeGroup]);

  const focusItem = (id: string, which: 'first' | 'last') => {
    requestAnimationFrame(() => {
      const links = document.querySelectorAll<HTMLAnchorElement>(`#${CSS.escape(uid + id)} a`);
      links[which === 'first' ? 0 : links.length - 1]?.focus();
    });
  };
  const onBtnKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(id); focusItem(id, e.key === 'ArrowDown' ? 'first' : 'last'); }
  };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a'));
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[n]?.focus();
  };

  return (
    <div className="border-b border-line bg-raised">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Logo label={labels.home} />

        {/* Desktop */}
        <nav ref={navRef} aria-label="Main" className="ms-auto hidden items-center gap-0.5 font-display font-bold lg:flex xl:gap-1">
          {groups.map((g) => {
            const isOpen = open === g.id;
            return (
              <div key={g.id} className="relative">
                <button ref={(el) => { btnRefs.current[g.id] = el; }} type="button" aria-expanded={isOpen} aria-controls={uid + g.id}
                  onClick={() => setOpen(isOpen ? null : g.id)} onKeyDown={onBtnKey(g.id)} data-nav-group={g.id}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-2 transition-colors xl:gap-1.5 xl:px-3.5 hover:bg-accent/10 hover:text-pitch ${isOpen || activeGroup === g.id ? 'bg-accent/10 text-pitch' : ''}`}>
                  {g.label}<Caret open={isOpen} />
                </button>
                <div id={uid + g.id} hidden={!isOpen} onKeyDown={onMenuKey}
                  className="absolute start-0 top-full z-50 mt-2 w-80 rounded-2xl border border-line bg-raised p-2 font-sans shadow-[0_18px_50px_rgba(11,15,10,.16)]">
                  {g.items.map((i) => (
                    <Link key={i.href} href={i.href} onClick={() => setOpen(null)}
                      className="block rounded-xl px-3.5 py-2.5 hover:bg-accent/10 focus-visible:bg-accent/10">
                      <span className="block font-display font-bold">{i.label}</span>
                      <span className="mt-0.5 block text-sm font-normal text-muted">{i.desc}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="hidden shrink-0 items-center gap-2 lg:ms-2 lg:flex xl:ms-4 xl:gap-2.5">
          <LanguageSwitcher label={labels.language} tone="light" />
          {appUrl ? <a href={appUrl} data-signin className="whitespace-nowrap rounded-full bg-accent font-display font-extrabold text-on-accent hover:brightness-95 px-5 py-2">{labels.signin}</a> : null}
        </div>

        {/* Phone */}
        <div className="ms-auto flex items-center gap-2 lg:hidden">
          {appUrl ? <a href={appUrl} data-signin className="whitespace-nowrap rounded-full bg-accent font-display font-extrabold text-on-accent hover:brightness-95 px-4 py-2">{labels.signin}</a> : null}
          <button ref={menuBtn} type="button" aria-expanded={panel} aria-controls={uid + 'panel'} onClick={() => setPanel(true)} data-menu-button
            className="flex items-center gap-2 rounded-full border-2 border-fg px-2.5 py-1.5 font-display font-bold sm:px-3.5">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <span className="sr-only sm:not-sr-only">{labels.menu}</span>
          </button>
        </div>
      </div>

      {panel ? (
        <div id={uid + 'panel'} role="dialog" aria-modal="true" aria-label={labels.menu} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-raised lg:hidden" data-menu-panel>
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <Logo label={labels.home} small />
            <button type="button" autoFocus onClick={() => { setPanel(false); menuBtn.current?.focus(); }}
              className="ms-auto flex items-center gap-2 rounded-full border-2 border-fg px-3.5 py-1.5 font-display font-bold">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              {labels.close}
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 px-5 py-2">
            {groups.map((g) => {
              const isOpen = fold === g.id;
              return (
                <div key={g.id} className="border-b border-line">
                  <button type="button" aria-expanded={isOpen} aria-controls={uid + 'm' + g.id} onClick={() => setFold(isOpen ? null : g.id)}
                    className="flex w-full items-center justify-between py-4 font-display text-xl font-extrabold">
                    {g.label}<Caret open={isOpen} />
                  </button>
                  <div id={uid + 'm' + g.id} hidden={!isOpen} className="pb-3">
                    {g.items.map((i) => (
                      <Link key={i.href} href={i.href} onClick={() => setPanel(false)} className="block rounded-xl px-3 py-2.5 hover:bg-accent/10">
                        <span className="block font-semibold">{i.label}</span>
                        <span className="block text-sm text-muted">{i.desc}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="flex flex-col gap-2.5 px-5 pb-8 pt-4">
            {appUrl ? <a href={appUrl} data-signin className="rounded-full bg-accent font-display font-extrabold text-on-accent hover:brightness-95 py-3.5 text-center">{labels.signin}</a> : null}
            <nav aria-label={labels.language} className="mt-2 flex flex-wrap justify-center gap-2">
              {LOCALES.map((l) => (
                <Link key={l} href={pathname} locale={l} hrefLang={l} lang={l} aria-current={l === locale ? 'true' : undefined}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold ${l === locale ? 'border-fg bg-fg text-raised' : 'border-line'}`}>
                  {LOCALE_LABELS[l].native}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
