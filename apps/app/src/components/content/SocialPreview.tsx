/**
 * How the three posts will look (approximately) on Facebook, Instagram and TikTok, with the branded picture.
 * Labels come from the page; the captions are the current saved text.
 */
export function SocialPreview({ captions, cardUrl, tallUrl, labels }: { captions: Record<'facebook' | 'instagram' | 'tiktok', string>; cardUrl: string; tallUrl: string; labels: { club: string; justNow: string } }) {
  const head = (
    <div className="flex items-center gap-2 p-3">
      <span className="grid size-8 place-items-center rounded-full bg-ink-950 text-[10px] font-black text-gold">AFC</span>
      <span className="leading-tight"><span className="block text-sm font-bold">{labels.club}</span><span className="text-xs text-muted">{labels.justNow}</span></span>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-3" data-social-preview>
      <figure className="overflow-hidden rounded-card border border-line bg-raised shadow-sm" data-preview="facebook">
        <figcaption className="bg-[#1877F2] px-3 py-1 text-xs font-bold text-white">Facebook</figcaption>
        {head}
        <p className="whitespace-pre-line px-3 pb-3 text-sm" dir="auto">{captions.facebook}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardUrl} alt="" className="aspect-square w-full object-cover" />
      </figure>
      <figure className="overflow-hidden rounded-card border border-line bg-raised shadow-sm" data-preview="instagram">
        <figcaption className="bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] px-3 py-1 text-xs font-bold text-white">Instagram</figcaption>
        {head}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardUrl} alt="" className="aspect-square w-full object-cover" />
        <p className="whitespace-pre-line p-3 text-sm" dir="auto"><b>afrofootclub</b> {captions.instagram}</p>
      </figure>
      <figure className="relative overflow-hidden rounded-card border border-line bg-ink-950 text-white shadow-sm" data-preview="tiktok">
        <figcaption className="relative z-10 bg-black px-3 py-1 text-xs font-bold">TikTok</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tallUrl} alt="" className="aspect-[9/16] w-full object-cover opacity-90" />
        <p className="absolute inset-x-0 bottom-0 whitespace-pre-line bg-gradient-to-t from-black/90 to-transparent p-3 pt-10 text-sm" dir="auto"><b>@afrofootclub</b><br />{captions.tiktok}</p>
      </figure>
    </div>
  );
}
