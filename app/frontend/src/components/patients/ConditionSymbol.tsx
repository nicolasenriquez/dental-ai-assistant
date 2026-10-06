export function ConditionSymbol({
  code,
  resolved = false,
  error = false,
}: { code: string; resolved?: boolean; error?: boolean }): JSX.Element {
  let mark: JSX.Element;
  switch (code) {
    case 'pulpitis':
      mark = <path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5" />;
      break;
    case 'caries':
      mark = <circle cx="12" cy="12" r="6" fill="currentColor" />;
      break;
    case 'incipient_caries':
      mark = <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />;
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
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {mark}
      {resolved && <rect x="1" y="1" width="22" height="22" rx="3" strokeDasharray="3 2" />}
      {error && <path d="M2 2 22 22" data-error-marker />}
    </svg>
  );
}
