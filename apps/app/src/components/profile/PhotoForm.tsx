'use client';

import { useActionState, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { savePlayerPhoto, type PhotoState } from '@/app/actions/photo';

/** Shrinks the chosen picture to a 512 px square JPEG in the browser (smaller upload, no location data), then sends it. */
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), size = Math.min(512, side);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('shrink'))), 'image/jpeg', 0.86));
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

export function PhotoForm({ current, name }: { current: string | null; name: string }) {
  const t = useTranslations('pp');
  const [state, action, pending] = useActionState<PhotoState, FormData>(savePlayerPhoto, { status: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = state.status === 'removed' ? null : preview ?? current;
  return (
    <div className="flex flex-wrap items-center gap-4" data-photo-form>
      {shown
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={shown} alt={t('photoAlt', { name })} className="size-24 rounded-full object-cover shadow" data-photo />
        : <span className="flex size-24 items-center justify-center rounded-full bg-fg/10 font-display text-2xl font-black" aria-hidden>{name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>}
      <div className="grid gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2" encType="multipart/form-data">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">
            {pending ? t('photoSaving') : shown ? t('photoChange') : t('photoAdd')}
            <input ref={input} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pending}
              onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try {
                  const small = await shrink(f);
                  const dt = new DataTransfer(); dt.items.add(small); e.target.files = dt.files;
                  setPreview(URL.createObjectURL(small));
                } catch { /* keep the original file; the server checks type and size */ }
                e.target.form?.requestSubmit();
              }} />
          </label>
        </form>
        {shown ? <form action={action}><input type="hidden" name="op" value="remove" /><button className="text-sm font-semibold text-danger underline">{t('photoRemove')}</button></form> : null}
        <p className="text-xs text-muted">{t('photoNote')}</p>
        {state.status === 'ok' ? <p role="status" className="text-sm font-semibold text-pitch">{t('photoSaved')}</p> : null}
        {state.status === 'error' ? <p role="alert" className="text-sm font-semibold text-danger">{t(state.error as 'e_failed')}</p> : null}
      </div>
    </div>
  );
}
