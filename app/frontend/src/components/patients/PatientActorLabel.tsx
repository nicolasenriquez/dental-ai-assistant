import type { PatientActor } from '../../lib/api';

export function PatientActorLabel({
  actor,
  actors = [],
}: { actor: PatientActor | null; actors?: PatientActor[] }): JSX.Element {
  if (!actor?.user_id) return <span>Autor no disponible</span>;
  const hex = actor.user_id.replace(/-/g, '');
  const others = [...new Set(actors.map((item) => item.user_id.replace(/-/g, '')))];
  let length = 8;
  while (
    length < hex.length &&
    others.some((id) => id !== hex && id.slice(0, length) === hex.slice(0, length))
  )
    length++;
  return (
    <details className="break-words text-sm">
      <summary className="inline-flex min-h-[44px] cursor-pointer items-center rounded focus-visible:ring-2 focus-visible:ring-primary">
        {actor.display_name || `Usuario ${hex.slice(0, length)}`}
      </summary>
      <p>Identificador de cuenta: {actor.user_id}</p>
    </details>
  );
}
