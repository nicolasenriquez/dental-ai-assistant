import type { TreatmentVariant } from '../../lib/api';

interface TreatmentSymbolProps {
  variant: Pick<TreatmentVariant, 'icon_key' | 'palette_role'>;
  className?: string;
}

// Independently authored motifs. The same registry metadata supplies palette, chart and records.
export function TreatmentSymbol({
  variant,
  className = 'h-6 w-6 shrink-0',
}: TreatmentSymbolProps): JSX.Element {
  const key = variant.icon_key;
  const root = key.startsWith('root_canal');
  const crown = key.includes('crown') || key === 'overlay' || key === 'inlay';
  const bridge = key.startsWith('bridge');
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      className={`${className} dental-${variant.palette_role}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4c2-2 4 0 6 0s4-2 6 0c3 4-1 7-2 12l-2 5-2-8-2 8-2-5C7 11 3 8 6 4Z" opacity=".5" />
      {root ? (
        <path
          d={
            key === 'root_canal_half'
              ? 'M9 6h6l-3 5'
              : key === 'root_canal_two_thirds'
                ? 'M9 6h6l-3 5-2 5m2-5 2 5'
                : 'M9 6h6l-3 5-2 9m2-9 2 9'
          }
          strokeWidth="2"
        />
      ) : crown ? (
        <>
          <path d="M5 5h14l-2 6H7Z" />
          <path d="m8 6 2 3m2-3 2 3m2-3 1 2" />
          {key.includes('implant') && <path d="M12 12v8m-3-6h6m-5 3h4" />}
        </>
      ) : bridge ? (
        <>
          <path d="M3 7h18v5H3Zm4-3v12m10-12v12" />
          {key.includes('zirconia') ? (
            <path d="m12 7 2 2-2 2-2-2Z" />
          ) : key.includes('maryland') ? (
            <path d="m3 7 5-3m13 3-5-3" />
          ) : (
            <path d="M3 12h18" strokeWidth="2.5" />
          )}
        </>
      ) : key === 'bracket' || key === 'tube' || key === 'band' ? (
        <>
          <path d="M3 9h18M8 6h8v6H8Z" />
          <path d="M10 7v4m4-4v4" />
        </>
      ) : key === 'implant' ? (
        <path d="M10 5h4v15h-4Zm-2 4h8m-8 4h8m-7 4h6" />
      ) : key === 'extraction' ? (
        <path d="m5 3 14 18M19 3 5 21" strokeWidth="2" />
      ) : key === 'post' ? (
        <path d="M10 5h4v5l-2 10-2-10Z" />
      ) : key === 'retainer' || key.startsWith('splint') ? (
        <path d="M3 9q9 6 18 0M5 8v4m5-3v4m4-4v4m5-5v4" />
      ) : key === 'attachment' ? (
        <path d="M9 6h6v5H9Z" />
      ) : key === 'apicoectomy' ? (
        <path d="M8 17h8m-8 2h8" strokeWidth="2" />
      ) : (
        <>
          <path d="M7 5h10v5H7Z" fill="currentColor" opacity=".4" />
          <path d="M9 6v3m3-3v3m3-3v3" />
        </>
      )}
    </svg>
  );
}
