import type { EvolutionDetail as Evolution } from '../lib/api';
import { formatClinicalDateLong, formatClinicalTime } from '../lib/clinicalDate';

const detailFields = [
  { key: 'context', label: 'Motivo / contexto' },
  { key: 'findings', label: 'Hallazgos' },
  { key: 'assessment', label: 'Diagnóstico / impresión clínica' },
  { key: 'treatment', label: 'Tratamiento / conducta' },
  { key: 'follow_up', label: 'Seguimiento' },
] as const;

type DetailFieldKey = (typeof detailFields)[number]['key'];

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function parseFinalText(text: string) {
  const sections: Partial<Record<DetailFieldKey, string>> = {};
  const fallback: string[] = [];
  let current: DetailFieldKey | null = null;

  for (const block of text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = block.indexOf(':');
    const field =
      separator === -1
        ? undefined
        : detailFields.find(
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

export function EvolutionDetailContent({ evolution }: { evolution: Evolution }) {
  const parsedFinalText = parseFinalText(evolution.final_text);

  return (
    <article className="patient-detail-content">
      <header className="patient-detail-header">
        <h2 id="evolution-detail-title">Evolución dental</h2>
        <p>
          Fecha de atención:{' '}
          <time dateTime={evolution.evolution_at}>
            {formatClinicalDateLong(evolution.evolution_at)} ·{' '}
            {formatClinicalTime(evolution.evolution_at)}
          </time>
        </p>
      </header>

      <div className="patient-clinical-sections">
        {detailFields.map(({ key, label }) => {
          const value = parsedFinalText.sections[key];
          if (!value) return null;

          return (
            <section key={key} className="patient-clinical-section">
              <h3>{label}</h3>
              <p>{value}</p>
            </section>
          );
        })}
        {parsedFinalText.fallback && (
          <section className="patient-clinical-section">
            <h3>Información adicional</h3>
            <p>{parsedFinalText.fallback}</p>
          </section>
        )}
      </div>
    </article>
  );
}
