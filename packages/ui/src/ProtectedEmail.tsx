'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * An email link that spam bots cannot read: the page carries only an encoded form of the address (reversed, base64;
 * see encodeEmail), and the browser turns it into a real mailto: link after loading. Most address harvesters read the
 * HTML without running scripts, so they find no address. Without JavaScript the fallback text is shown instead.
 * children: the link text (e.g. "write to us"); without children the address itself is the link text.
 */
export function ProtectedEmail({ code, children, fallback, className }: { code: string; children?: ReactNode; fallback: ReactNode; className?: string }) {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    try { setAddress([...atob(code)].reverse().join('')); } catch { setAddress(null); }
  }, [code]);
  if (!address) return <span className={className} data-protected-email="pending">{children ?? fallback}</span>;
  return <a href={`mailto:${address}`} className={className} dir="ltr" data-protected-email="ready">{children ?? address}</a>;
}
