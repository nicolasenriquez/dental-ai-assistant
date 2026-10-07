import { findingPaletteRole } from '../../lib/odontogramPresentation';

export function ConditionSymbol({
  code,
  resolved = false,
  error = false,
}: { code: string; resolved?: boolean; error?: boolean }): JSX.Element {
  let mark: JSX.Element;
  switch (code) {
    case 'pulpitis':
      mark = <path d="M9 6q3 3 6 0l-2 6-1 9-1-9Z" fill="currentColor" />;
      break;
    case 'caries':
      mark = <path d="m8 6 4 1 3-1 2 4-3 3-4-1-3 1-1-4Z" fill="currentColor" />;
      break;
    case 'incipient_caries':
      mark = (
        <>
          <circle cx="9" cy="8" r="1" fill="currentColor" />
          <circle cx="14" cy="9" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </>
      );
      break;
    case 'pigmentation':
      mark = (
        <>
          <circle cx="8" cy="9" r="1.5" />
          <circle cx="15" cy="8" r="1.5" />
          <circle cx="12" cy="15" r="1.5" />
        </>
      );
      break;
    case 'fracture':
      mark = <path d="m14 2-5 8 6 2-5 10" />;
      break;
    case 'missing':
      mark = <path d="m5 5 14 14M19 5 5 19" />;
      break;
    case 'periapical_lt_2mm':
      mark = <circle cx="12" cy="15" r="3" />;
      break;
    case 'periapical_2_4mm':
      mark = <circle cx="12" cy="15" r="5" />;
      break;
    case 'periapical_gt_4mm':
      mark = <circle cx="12" cy="15" r="8" />;
      break;
    case 'rotated':
      mark = <path d="M5 9a7 7 0 1 1 0 7M3 4v6h6" />;
      break;
    case 'displaced':
      mark = <path d="M3 12h18m-5-5 5 5-5 5" />;
      break;
    case 'unerupted':
      mark = <path d="M3 8h18M7 18v-4a5 5 0 0 1 10 0v4" />;
      break;
    default:
      mark = <path d="M12 4v12m0 4h.01" />;
  }
  return (
    <svg
      aria-hidden="true"
      data-condition-symbol={code}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className={`h-6 w-6 shrink-0 dental-${findingPaletteRole(code)}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4q3-2 6 0 3-2 6 0c3 4-1 7-2 12l-2 5-2-8-2 8-2-5C7 11 3 8 6 4Z" opacity=".4" />
      {mark}
      {resolved && <rect x="1" y="1" width="22" height="22" rx="3" strokeDasharray="3 2" />}
      {error && <path d="M2 2 22 22" data-error-marker />}
    </svg>
  );
}
