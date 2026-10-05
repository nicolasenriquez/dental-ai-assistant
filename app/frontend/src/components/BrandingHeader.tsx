import { DentalToothIcon } from './DentalToothIcon';

export function BrandingHeader() {
  return (
    <div className="auth-brand">
      <div className="auth-brand__name">
        <span className="auth-brand__mark" aria-hidden="true">
          <DentalToothIcon className="size-6" />
        </span>
        <span className="text-xl font-semibold text-[var(--text-primary)]">
          Dental AI Assistant
        </span>
      </div>
      <p className="auth-brand__headline">Tu espacio clínico, con el paciente en contexto.</p>
      <p className="auth-brand__description">
        Consulta fichas y prepara evoluciones clínicas. La IA propone; tú revisas y decides qué
        guardar.
      </p>
      <p className="auth-brand__steps">
        Paciente <span aria-hidden="true">→</span> Borrador <span aria-hidden="true">→</span>{' '}
        Revisión
      </p>
    </div>
  );
}
