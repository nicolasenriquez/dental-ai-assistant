import type { ClinicalDraft } from '../../lib/api';

export type ClinicalField = Exclude<keyof ClinicalDraft, 'review_flags'>;

export const clinicalFields: ReadonlyArray<{ key: ClinicalField; label: string }> = [
  { key: 'context', label: 'Motivo / contexto' },
  { key: 'findings', label: 'Hallazgos' },
  { key: 'assessment', label: 'Diagnóstico / impresión clínica' },
  { key: 'treatment', label: 'Tratamiento / conducta' },
  { key: 'follow_up', label: 'Seguimiento' },
];

export function composeClinicalDraft(draft: ClinicalDraft): string {
  return clinicalFields
    .map(({ key, label }) => ({ label, value: draft[key].trim() }))
    .filter(({ value }) => value.length > 0)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n\n');
}

export function hasClinicalContent(draft: ClinicalDraft): boolean {
  return clinicalFields.some(({ key }) => draft[key].trim().length > 0);
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function parseClinicalText(text: string): {
  sections: Partial<Record<ClinicalField, string>>;
  fallback: string;
} {
  const sections: Partial<Record<ClinicalField, string>> = {};
  const fallback: string[] = [];
  let current: ClinicalField | null = null;

  for (const block of text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = block.indexOf(':');
    const field =
      separator === -1
        ? undefined
        : clinicalFields.find(
            ({ label }) =>
              normalizeLabel(block.slice(0, separator).trim()) === normalizeLabel(label),
          );
    if (field) {
      const value = block.slice(separator + 1).trim();
      if (value) sections[field.key] = value;
      current = field.key;
    } else if (current) {
      sections[current] = [sections[current], block].filter(Boolean).join('\n\n');
    } else {
      fallback.push(block);
    }
  }

  return { sections, fallback: fallback.join('\n\n') };
}
