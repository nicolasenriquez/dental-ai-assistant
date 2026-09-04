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
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: 'numeric',
  minute: '2-digit',
});

const clinicalDateInputPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function formatClinicalDate(value: string | Date): string {
  return dateFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatClinicalDateTime(value: string | Date): string {
  return dateTimeFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatClinicalDateShort(value: string | Date): string {
  return shortDateFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatClinicalDateLong(value: string | Date): string {
  return longDateFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatClinicalTime(value: string | Date): string {
  return timeFormatter.format(value instanceof Date ? value : new Date(value));
}

export function parseClinicalDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = clinicalDateInputPattern.exec(trimmed);
  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return iso;
}
