import { type RefObject, useState } from 'react';
import type {
  AddPlanItem,
  Dentition,
  ToothSurface,
  TreatmentCatalog,
  TreatmentMember,
} from '../../lib/api';
import { Button } from '../ui/Button';
import { PatientOdontogram } from './PatientOdontogram';
import { TreatmentSymbol } from './TreatmentSymbol';

interface ClinicalPlanItemComposerProps {
  formRef?: RefObject<HTMLFormElement>;
  catalog: TreatmentCatalog;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (
    item: Omit<AddPlanItem, 'operation_id' | 'expected_revision' | 'id'>,
  ) => Promise<boolean>;
}
export function ClinicalPlanItemComposer({
  formRef,
  catalog,
  busy,
  onDirty,
  onSave,
}: ClinicalPlanItemComposerProps): JSX.Element {
  const [variantId, setVariantId] = useState('');
  const [dentition, setDentition] = useState<Dentition>('permanent');
  const [members, setMembers] = useState<TreatmentMember[]>([]);
  const [arch, setArch] = useState<'upper' | 'lower'>('upper');
  const [note, setNote] = useState('');
  const [sessions, setSessions] = useState('Sesión 1');
  const [highlighted, setHighlighted] = useState(0);
  const variant = catalog.variants.find((v) => v.id === variantId);
  const reset = (): void => {
    setVariantId('');
    setMembers([]);
    setNote('');
    setSessions('Sesión 1');
    onDirty(false);
  };
  const select = (tooth: number): void => {
    if (!variant || busy) return;
    onDirty(true);
    setMembers((previous) => {
      const next = {
        tooth_fdi: tooth,
        role: variant.clinical_type === 'bridge' ? ('pillar' as const) : ('tooth' as const),
        surfaces: [],
      };
      if (variant.scope === 'tooth') return [next];
      return previous.some((m) => m.tooth_fdi === tooth)
        ? previous.filter((m) => m.tooth_fdi !== tooth)
        : [...previous, next];
    });
  };
  return (
    <form
      ref={formRef}
      aria-label="Procedimiento planificado"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!variant) return;
        const value = {
          treatment: {
            id: crypto.randomUUID(),
            variant_id: variant.id,
            dentition,
            teeth: variant.scope === 'global_arch' ? [] : members,
            arch: variant.scope === 'global_arch' ? arch : null,
            note: note.trim() || null,
          },
          stages: sessions
            .split('\n')
            .map((label) => ({ label: label.trim() }))
            .filter((s) => s.label),
        };
        void onSave(value).then((saved) => {
          if (saved) reset();
        });
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">
          Procedimiento
          <select
            required
            disabled={busy}
            value={variantId}
            onChange={(event) => {
              setVariantId(event.target.value);
              setMembers([]);
              onDirty(!!event.target.value);
            }}
            className="mt-1 block w-full rounded border border-border bg-surface p-2 text-foreground"
          >
            <option value="">Selecciona una variante</option>
            {catalog.categories.map((category) => (
              <optgroup key={category.key} label={category.label_es}>
                {catalog.variants
                  .filter((v) => v.category_key === category.key && v.enabled)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label_es}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        {variant && (
          <>
            <div className="flex items-center gap-2">
              <TreatmentSymbol variant={variant} />
              <span>{variant.label_es} · Planificado</span>
            </div>
            <PatientOdontogram
              dentition={dentition}
              conditions={[]}
              labels={{}}
              selectedTooth={members[0]?.tooth_fdi ?? 0}
              selectedTeeth={members.map((m) => m.tooth_fdi)}
              highlightedTooth={highlighted}
              onHighlight={setHighlighted}
              onSelect={select}
              disabled={busy || variant.scope === 'global_arch'}
              controls={
                <div className="flex flex-wrap gap-2">
                  {(['permanent', 'primary'] as const).map((d) => (
                    <Button
                      key={d}
                      variant="clinicalSecondary"
                      aria-pressed={dentition === d}
                      disabled={busy}
                      onClick={() => {
                        setDentition(d);
                        setMembers([]);
                      }}
                    >
                      {d === 'permanent' ? 'Permanente' : 'Temporal'}
                    </Button>
                  ))}
                </div>
              }
            />
            {variant.scope === 'global_arch' ? (
              <label className="block text-sm">
                Arcada
                <select
                  value={arch}
                  onChange={(event) => setArch(event.target.value as 'upper' | 'lower')}
                  className="ml-2 rounded border border-border bg-surface p-2"
                >
                  <option value="upper">Superior</option>
                  <option value="lower">Inferior</option>
                </select>
              </label>
            ) : (
              <p className="text-sm text-muted">
                {variant.scope === 'tooth'
                  ? 'Selecciona una pieza en el odontograma.'
                  : 'Selecciona las piezas de la misma arcada; cada procedimiento se guarda como una unidad.'}
              </p>
            )}
            {members.map((member) => (
              <fieldset key={member.tooth_fdi} className="flex flex-wrap items-center gap-3">
                <legend className="text-sm">Pieza {member.tooth_fdi}</legend>
                {variant.clinical_type === 'bridge' && (
                  <label>
                    Rol
                    <select
                      value={member.role}
                      onChange={(event) =>
                        setMembers((previous) =>
                          previous.map((m) =>
                            m.tooth_fdi === member.tooth_fdi
                              ? { ...m, role: event.target.value as 'pillar' | 'pontic' }
                              : m,
                          ),
                        )
                      }
                      className="ml-2 rounded border border-border bg-surface p-2"
                    >
                      <option value="pillar">Pilar</option>
                      <option value="pontic">Póntico</option>
                    </select>
                  </label>
                )}
                {variant.surface_codes.map((surface: ToothSurface) => (
                  <label key={surface} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={member.surfaces.includes(surface)}
                      onChange={(event) =>
                        setMembers((previous) =>
                          previous.map((m) =>
                            m.tooth_fdi === member.tooth_fdi
                              ? {
                                  ...m,
                                  surfaces: event.target.checked
                                    ? [...m.surfaces, surface]
                                    : m.surfaces.filter((s) => s !== surface),
                                }
                              : m,
                          ),
                        )
                      }
                    />
                    {surface}
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="block text-sm">
              Nota del procedimiento
              <textarea
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 block w-full rounded border border-border bg-surface p-2"
              />
            </label>
            <label className="block text-sm">
              Sesiones (una por línea)
              <textarea
                required
                value={sessions}
                onChange={(event) => setSessions(event.target.value)}
                className="mt-1 block w-full rounded border border-border bg-surface p-2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="clinical"
                type="submit"
                disabled={
                  busy ||
                  !sessions.trim() ||
                  (variant.scope === 'tooth'
                    ? members.length !== 1
                    : variant.scope === 'multi_tooth'
                      ? members.length < 2
                      : false)
                }
              >
                Añadir procedimiento
              </Button>
              <Button variant="clinicalSecondary" onClick={reset} disabled={busy}>
                Descartar procedimiento
              </Button>
            </div>
          </>
        )}
      </fieldset>
    </form>
  );
}
