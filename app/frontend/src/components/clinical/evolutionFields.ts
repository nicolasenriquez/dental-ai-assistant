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
