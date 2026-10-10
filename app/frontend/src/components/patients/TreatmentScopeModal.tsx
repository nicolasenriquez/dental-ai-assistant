import { useState } from 'react';
import type { useDentalWorkspace } from '../../hooks/useDentalWorkspace';
import type { Dentition, TreatmentMember, TreatmentVariant } from '../../lib/api';
import { Button } from '../ui/Button';
import { DentalConditionModal } from './DentalConditionModal';

interface TreatmentScopeModalProps {
  variant: TreatmentVariant;
  dentition: Dentition;
  dental: ReturnType<typeof useDentalWorkspace>;
  returnFocus: HTMLElement | null;
  suspended: boolean;
  onClose: () => void;
}

export function TreatmentScopeModal({
  variant,
  dentition,
  dental,
  returnFocus,
  suspended,
  onClose,
}: TreatmentScopeModalProps): JSX.Element {
  const arch = variant.scope === 'global_arch';
  const bridge = variant.clinical_type === 'bridge';
  const [members, setMembers] = useState<TreatmentMember[]>(() =>
    dental.selectedTeeth.map((tooth_fdi, index, teeth) => ({
      tooth_fdi,
      surfaces: [],
      role: bridge ? (index === 0 || index === teeth.length - 1 ? 'pillar' : 'pontic') : 'tooth',
    })),
  );
  const locked = dental.busy || !!dental.attempt;
  const valid = members.length >= 2 && (!bridge || members.some((m) => m.role === 'pillar'));
  const apply = async (selectedArch?: 'upper' | 'lower'): Promise<void> => {
    await dental.applyTreatment({
      variant_id: variant.id,
      dentition,
      teeth: arch ? [] : members,
      ...(selectedArch ? { arch: selectedArch } : {}),
      note: null,
    });
  };
  return (
    <DentalConditionModal
      label={arch ? 'Seleccionar arcada' : 'Confirmar procedimiento en varias piezas'}
      returnFocus={returnFocus}
      suspended={suspended}
      onClose={onClose}
    >
      <div className="space-y-4">
        <h3 className="font-semibold">{variant.label_es}</h3>
        <p className="text-sm text-muted">
          Existente · {dentition === 'permanent' ? 'Permanente' : 'Temporal'}.{' '}
          {arch
            ? 'Selecciona la arcada para registrar un solo aparato.'
            : 'Confirma las piezas como un solo procedimiento.'}
        </p>
        {!arch && (
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.tooth_fdi} className="flex flex-wrap items-center gap-2">
                <span>Pieza {member.tooth_fdi}</span>
                {bridge && (
                  <label className="flex items-center gap-2">
                    Rol de pieza {member.tooth_fdi}
                    <select
                      className="min-h-11 rounded border border-border bg-surface p-2"
                      disabled={locked}
                      value={member.role}
                      onChange={(event) => {
                        const role = event.target.value as 'pillar' | 'pontic';
                        setMembers((current) =>
                          current.map((m) =>
                            m.tooth_fdi === member.tooth_fdi ? { ...m, role } : m,
                          ),
                        );
                      }}
                    >
                      <option value="pillar">Pilar</option>
                      <option value="pontic">Póntico</option>
                    </select>
                  </label>
                )}
              </div>
            ))}
            {bridge && (
              <p className="text-sm text-muted">
                Requiere al menos un pilar. Revisa el rol de cada pieza.
              </p>
            )}
          </div>
        )}
        {dental.error && <p role="alert">{dental.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="clinicalSecondary" disabled={dental.busy} onClick={onClose}>
            {dental.attempt ? 'Descartar intento' : 'Cancelar'}
          </Button>
          {arch ? (
            (['upper', 'lower'] as const).map((value) => (
              <Button
                key={value}
                variant="clinical"
                disabled={locked}
                onClick={() => void apply(value)}
              >
                Arcada {value === 'upper' ? 'superior' : 'inferior'}
              </Button>
            ))
          ) : (
            <Button variant="clinical" disabled={locked || !valid} onClick={() => void apply()}>
              Confirmar
            </Button>
          )}
          {dental.attempt && (
            <Button variant="clinical" disabled={dental.busy} onClick={() => void dental.retry()}>
              Reintentar operación
            </Button>
          )}
        </div>
      </div>
    </DentalConditionModal>
  );
}
