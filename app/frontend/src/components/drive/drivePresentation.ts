export function driveTypeLabel(mimeType: string, name: string, kind?: string): string {
  const lowerName = name.toLowerCase();
  const lowerMimeType = mimeType.toLowerCase();

  if (kind === 'pdf' || lowerMimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'PDF';
  }
  if (kind === 'docx' || lowerMimeType.includes('word') || lowerName.endsWith('.docx')) {
    return 'DOCX';
  }
  if (kind === 'google-doc' || lowerMimeType.includes('google-apps.document')) {
    return 'Google Doc';
  }
  if (kind === 'markdown' || lowerMimeType === 'text/markdown' || lowerName.endsWith('.md')) {
    return 'Markdown';
  }
  if (kind === 'text' || lowerMimeType === 'text/plain' || lowerName.endsWith('.txt')) {
    return 'TXT';
  }

  const parts = mimeType.split('/');
  return parts[parts.length - 1]?.toUpperCase() || 'Archivo';
}

export function formatDriveDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';

  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function newestFirst<T extends { modifiedTime: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.modifiedTime).getTime();
    const rightTime = new Date(right.modifiedTime).getTime();
    return (
      (Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime) -
      (Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime)
    );
  });
}
