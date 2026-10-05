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

function isRutCharacter(value: string | undefined): boolean {
  return value !== undefined && /[0-9Kk]/.test(value);
}

function translateSelectionBoundary(value: string, formatted: string, position: number): number {
  const clampedPosition = Math.max(0, Math.min(position, value.length));
  let logicalPosition = 0;

  for (let index = 0; index < clampedPosition; index += 1) {
    if (isRutCharacter(value[index])) logicalPosition += 1;
  }

  let formattedPosition = 0;
  let logicalSeen = 0;
  while (formattedPosition < formatted.length && logicalSeen < logicalPosition) {
    if (!isFormattingSeparator(formatted[formattedPosition])) logicalSeen += 1;
    formattedPosition += 1;
  }

  const previousWasSeparator =
    clampedPosition > 0 && isFormattingSeparator(value[clampedPosition - 1]);
  if (
    isRutCharacter(value[clampedPosition]) ||
    (previousWasSeparator && !isFormattingSeparator(value[clampedPosition]))
  ) {
    while (
      formattedPosition < formatted.length &&
      isFormattingSeparator(formatted[formattedPosition])
    ) {
      formattedPosition += 1;
    }
  }

  return Math.max(0, Math.min(formattedPosition, formatted.length));
}

function formatCompact(compact: string): string {
  if (compact.endsWith('K')) {
    const body = compact
      .slice(0, -1)
      .replace(/[^0-9]/g, '')
      .slice(0, 8);
    return body ? `${formatBody(body)}-K` : '';
  }

  const digits = compact.replace(/[^0-9]/g, '').slice(0, 9);
  if (!digits) return '';

  // Eight compact digits are ambiguous; keep seven as body until ninth digit arrives.
  const hasDv = digits.length >= 8;
  const body = hasDv ? digits.slice(0, -1) : digits;
  const dv = hasDv ? digits.slice(-1) : '';
  return `${formatBody(body)}${dv ? `-${dv}` : ''}`;
}

function compactRut(value: string): string {
  return value.toUpperCase().replace(/[.\s-]/g, '');
}

function checkDigit(number: number): string {
  let total = 0;
  let factor = 2;
  for (const digit of String(number).split('').reverse()) {
    total += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const remainder = 11 - (total % 11);
  return remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
}

/** Returns true only when the complete RUT body and check digit are valid. */
export function validateRut(value: string): boolean {
  const match = /^(\d{1,8})([0-9K])$/.exec(compactRut(value));
  if (!match) return false;

  const number = Number(match[1]);
  return number > 0 && checkDigit(number) === match[2];
}

/** A RUT is complete once it has an explicit DV or enough digits for body + DV. */
export function isCompleteRutInput(value: string): boolean {
  const compact = compactRut(value);
  return value.includes('-') || compact.length >= 8;
}

export function formatRutInput(value: string, finalize = false): string {
  void finalize;
  const upper = value.toUpperCase();
  const hyphenIndex = upper.indexOf('-');

  if (hyphenIndex >= 0) {
    const body = upper.slice(0, hyphenIndex).replace(/[.\s]/g, '');
    const dv = upper.slice(hyphenIndex + 1).replace(/[^0-9K]/g, '');

    const digits = body.replace(/[^0-9]/g, '').slice(0, 8);
    if (!digits) return '';
    if (!dv) return `${formatBody(digits)}-`;

    return formatCompact(`${digits}${dv}`);
  }

  const compact = upper.match(/[0-9K]/g)?.join('') ?? '';
  const normalized = compact.replace(/K(?=.*[0-9K])/g, '');
  return formatCompact(normalized);
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
