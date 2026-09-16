import type { EvolutionDetail as Evolution } from '../lib/api';
import { formatClinicalDateLong, formatClinicalTime } from '../lib/clinicalDate';
import { clinicalFields, parseClinicalText } from './clinical/evolutionFields';

export function EvolutionDetailContent({ evolution }: { evolution: Evolution }) {
  const parsedFinalText = parseClinicalText(evolution.final_text);

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
        {clinicalFields.map(({ key, label }) => {
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
