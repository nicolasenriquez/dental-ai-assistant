export function TerminologyEvidenceResult({
  payload,
}: { payload: Record<string, unknown> }): JSX.Element {
  const results = Array.isArray(payload.results) ? payload.results : [];
  return (
    <section aria-label="Terminología consultada" className="space-y-2 text-sm">
      <h3 className="font-medium">Terminología consultada</h3>
      <p className="text-muted">Definiciones generales; no establecen hallazgos del paciente.</p>
      <ul className="space-y-2">
        {results.map((row, index) => {
          if (!row || typeof row !== 'object') return null;
          return (
            <li key={typeof row.raw_term === 'string' ? row.raw_term : `term-${index}`}>
              {typeof row.raw_term === 'string' ? row.raw_term : 'Término'} ·{' '}
              {row.status === 'matched'
                ? 'Coincidencia encontrada'
                : row.status === 'ambiguous'
                  ? 'Requiere aclaración'
                  : 'Sin coincidencia verificada'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
