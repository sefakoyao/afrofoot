import { scriptable } from '@/lib/esign-script';

/**
 * A typed name drawn as a signature: handwriting font (Great Vibes) over a signature line, in ink blue. Names in other
 * scripts (e.g. Arabic) use the normal bold font. Used on the contract pages and in the live preview before signing.
 */
export function SignatureMark({ name, placeholder, size = 'lg' }: { name: string | null; placeholder?: string; size?: 'lg' | 'md' }) {
  const text = name?.trim() ?? '';
  const script = scriptable(text);
  return (
    <div className={`flex items-end border-b-2 border-line px-1 ${size === 'lg' ? 'min-h-20' : 'min-h-16'}`} data-signature-mark={text ? (script ? 'script' : 'plain') : 'empty'}>
      {text ? (
        <span dir="auto" className={`block max-w-full truncate leading-tight text-[#0d1f59] ${script ? `font-signature ${size === 'lg' ? 'text-5xl' : 'text-4xl'} pb-1` : `font-display font-extrabold ${size === 'lg' ? 'text-2xl' : 'text-xl'} pb-2`}`}>
          {text}
        </span>
      ) : <span className="pb-2 text-sm text-muted">{placeholder}</span>}
    </div>
  );
}
