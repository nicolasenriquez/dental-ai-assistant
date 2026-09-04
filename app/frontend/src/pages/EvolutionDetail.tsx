import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type EvolutionDetail as Evolution, getEvolution } from '../lib/api';

export function EvolutionDetail() {
  const { patientId = '', evolutionId = '' } = useParams<{
    patientId: string;
    evolutionId: string;
  }>();
  const [evolution, setEvolution] = useState<Evolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setEvolution(await getEvolution(evolutionId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [evolutionId]);

  return (
    <main className="min-h-full bg-[var(--bg)] p-6 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to={`/patients/${patientId}`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ‹ Volver al paciente
        </Link>
        {loading ? (
          <p className="mt-8 text-[var(--text-secondary)]">Cargando evolucion...</p>
        ) : error || !evolution ? (
          <div role="alert" className="mt-8 text-[var(--danger)]">
            <p>No pudimos cargar la evolucion</p>
            <Link to={`/patients/${patientId}`} className="mt-3 inline-block underline">
              Volver
            </Link>
            <button type="button" onClick={() => void load()} className="ml-4 underline">
              Reintentar
            </button>
          </div>
        ) : (
          <article className="mt-4">
            <header>
              <h1 className="text-2xl font-semibold">
                Evolucion dental ·{' '}
                {new Date(evolution.evolution_at).toLocaleString('es-CL', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Registro aprobado</p>
            </header>
            <div className="mt-8 space-y-6">
              {evolution.final_text
                .split('\n\n')
                .filter(Boolean)
                .map((section) => {
                  const [label, ...content] = section.split(': ');
                  return (
                    <section key={section}>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        {label}
                      </h2>
                      <p className="mt-2 whitespace-pre-wrap">{content.join(': ')}</p>
                    </section>
                  );
                })}
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
