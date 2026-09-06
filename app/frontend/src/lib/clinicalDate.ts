const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const shortDateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const longDateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const clinicalDateInputPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const isoDateInputPattern = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/;
const shortMonths = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function dateParts(value: string | Date) {
  return dateFormatter.formatToParts(value instanceof Date ? value : new Date(value));
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

export function formatClinicalDate(value: string | Date): string {
  const parts = dateParts(value);
  return `${partValue(parts, 'day')}/${partValue(parts, 'month')}/${partValue(parts, 'year')}`;
}

export function formatClinicalDateTime(value: string | Date): string {
  const date = toDate(value);
  const parts = dateTimeFormatter.formatToParts(date);
  return `${partValue(parts, 'day')} ${shortMonths[date.getMonth()]} ${partValue(parts, 'year')} · ${partValue(parts, 'hour')}:${partValue(parts, 'minute')}`;
}

export function formatClinicalDateShort(value: string | Date): string {
  const date = toDate(value);
  const parts = shortDateFormatter.formatToParts(date);
  return `${partValue(parts, 'day')} ${shortMonths[date.getMonth()]} ${partValue(parts, 'year')}`;
}

export function formatClinicalDateLong(value: string | Date): string {
  return longDateFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatClinicalTime(value: string | Date): string {
  const parts = timeFormatter.formatToParts(value instanceof Date ? value : new Date(value));
  return `${partValue(parts, 'hour')}:${partValue(parts, 'minute')}`;
}

export function normalizeClinicalDateInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const isoMatch = isoDateInputPattern.exec(trimmed);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }

  const digits = trimmed.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseClinicalDateInput(value: string, today = new Date()): string | null {
  const trimmed = normalizeClinicalDateInput(value);
  if (!trimmed) return null;

  const match = clinicalDateInputPattern.exec(trimmed);
  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (
    Number(year) < 1 ||
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (iso > todayIso) return null;

  return iso;
}
