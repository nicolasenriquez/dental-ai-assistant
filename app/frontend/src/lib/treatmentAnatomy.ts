import type { PatientTreatment } from './api';

export function treatmentAnatomy(record: Pick<PatientTreatment, 'teeth' | 'arch'>): string {
  if (record.arch) return record.arch === 'upper' ? 'Arcada superior' : 'Arcada inferior';
  if (record.teeth.length === 1) return `Pieza ${record.teeth[0].tooth_fdi}`;
  return `Piezas ${record.teeth.map((m) => m.tooth_fdi).join(', ')}`;
}

export function treatmentMembers(record: Pick<PatientTreatment, 'teeth' | 'arch'>): string {
  if (record.arch) return treatmentAnatomy(record);
  return record.teeth
    .map(
      (m) =>
        `${m.tooth_fdi}${m.role === 'pillar' ? ' (Pilar)' : m.role === 'pontic' ? ' (Póntico)' : ''} · ${m.surfaces.join(', ') || 'Pieza completa'}`,
    )
    .join('; ');
}
