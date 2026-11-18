'use client';

import { useState } from 'react';

/** A team crest from the results service, with the team's initials when there is none or it fails to load. */
export function Crest({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="grid size-14 place-items-center overflow-hidden rounded-full bg-white/10 font-display text-lg font-black" data-crest>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && !failed ? <img src={src} alt="" width={56} height={56} onError={() => setFailed(true)} className="size-14 rounded-full bg-white object-contain p-1" />
        : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}
