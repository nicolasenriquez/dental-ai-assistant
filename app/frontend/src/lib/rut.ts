function formatBody(body: string): string {
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type RutInputSelection = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

function isFormattingSeparator(value: string): boolean {
  return /[.\-\s]/.test(value);
}

function translateSelectionBoundary(
  value: string,
  formatted: string,
  position: number,
): number {
  const clampedPosition = Math.max(0, Math.min(position, value.length));
  let logicalPosition = 0;

  for (let index = 0; index < clampedPosition; index += 1) {
    if (!isFormattingSeparator(value[index])) logicalPosition += 1;
  }

  let formattedPosition = 0;
  let logicalSeen = 0;
  while (formattedPosition < formatted.length && logicalSeen < logicalPosition) {
    if (!isFormattingSeparator(formatted[formattedPosition])) logicalSeen += 1;
    formattedPosition += 1;
  }

  if (!isFormattingSeparator(value[clampedPosition])) {
    while (
      formattedPosition < formatted.length &&
      isFormattingSeparator(formatted[formattedPosition])
    ) {
      formattedPosition += 1;
    }
  }

  return Math.max(0, Math.min(formattedPosition, formatted.length));
}

export function formatRutInput(value: string, finalize = false): string {
  const upper = value.toUpperCase();
  const hyphenIndex = upper.indexOf('-');

  if (hyphenIndex >= 0) {
    const body = upper.slice(0, hyphenIndex).replace(/[.\s]/g, '');
    const dv = upper.slice(hyphenIndex + 1).replace(/[.\s]/g, '');

    if (!/^\d{0,8}$/.test(body) || !/^[0-9K]?$/.test(dv)) {
      return value;
    }

    return `${formatBody(body)}${dv ? `-${dv}` : '-'}`;
  }

  const compact = upper.replace(/[.\s]/g, '');
  if (!/^\d{0,8}[0-9K]?$/.test(compact)) {
    return value;
  }

  const hasDv =
    compact.endsWith('K') ||
    compact.length === 9 ||
    (finalize && compact.length === 8);
  const body = hasDv ? compact.slice(0, -1) : compact;
  const dv = hasDv ? compact.slice(-1) : '';

  return `${formatBody(body)}${dv ? `-${dv}` : ''}`;
}

export function formatRutInputWithSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): RutInputSelection {
  const formatted = formatRutInput(value);

  return {
    value: formatted,
    selectionStart: translateSelectionBoundary(value, formatted, selectionStart),
    selectionEnd: translateSelectionBoundary(value, formatted, selectionEnd),
  };
}
