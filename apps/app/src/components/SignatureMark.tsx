import { scriptable } from '@/lib/esign-script';

/**
 * A typed name drawn as a signature: handwriting font (Mrs Saint Delafield) over a signature line, in ink blue. Names in other
 * scripts (e.g. Arabic) use the normal bold font. Used on the contract pages and in the live preview before signing.
 */
export function SignatureMark({ name, placeholder, size = 'lg' }: { name: string | null; placeholder?: string; size?: 'lg' | 'md' }) {
  const text = name?.trim() ?? '';
  const script = scriptable(text);
  // the handwriting shrinks to fit the box (container width), whatever the length of the name
  const fit = script && text ? { fontSize: `min(${size === 'lg' ? 3.75 : 3}rem, ${(100 / (Math.max(6, text.length) * 0.42)).toFixed(1)}cqw)` } : undefined;
  return (
    <div className={`flex items-end overflow-hidden border-b-2 border-line px-1 [container-type:inline-size] ${size === 'lg' ? 'min-h-20' : 'min-h-16'}`} data-signature-mark={text ? (script ? 'script' : 'plain') : 'empty'}>
      {text ? (
        <span dir="auto" style={fit} className={`block max-w-full whitespace-nowrap leading-tight text-[#0d1f59] ${script ? 'font-signature pb-0.5' : `truncate font-display font-extrabold ${size === 'lg' ? 'text-2xl' : 'text-xl'} pb-2`}`}>
          {text}
        </span>
      ) : <span className="pb-2 text-sm text-muted">{placeholder}</span>}
    </div>
  );
}
