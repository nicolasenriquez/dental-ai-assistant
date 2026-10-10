import type { ConditionCatalog, TreatmentCatalog } from '../../lib/api';
import { resolveCondition } from '../../lib/odontogramPresentation';
import { ConditionSymbol } from './ConditionSymbol';
import { TreatmentSymbol } from './TreatmentSymbol';

const groups = [
  {
    label: 'Restauradora',
    types: [
      'filling_composite',
      'filling_amalgam',
      'filling_temporary',
      'sealant',
      'veneer',
      'inlay',
      'overlay',
      'crown',
      'crown_on_implant',
      'provisional_crown_on_implant',
      'bridge',
      'splint',
    ],
  },
  { label: 'Cirugía', types: ['extraction', 'implant', 'apicoectomy'] },
  {
    label: 'Endodoncia',
    types: [
      'root_canal_full',
      'root_canal_two_thirds',
      'root_canal_half',
      'post',
      'root_canal_overfill',
    ],
  },
  { label: 'Ortodoncia', types: ['bracket', 'tube', 'band', 'attachment', 'retainer'] },
];
// Concepts describe the shared symbol, never one variant of the clinical type.
const CONCEPT_LABELS: Record<string, string> = {
  filling_composite: 'Obturación',
  filling_amalgam: 'Obturación de amalgama',
  filling_temporary: 'Obturación temporal',
  sealant: 'Sellador',
  veneer: 'Carilla',
  inlay: 'Incrustación',
  overlay: 'Recubrimiento',
  crown: 'Corona',
  crown_on_implant: 'Corona sobre implante',
  provisional_crown_on_implant: 'Corona provisional sobre implante',
  bridge: 'Puente',
  splint: 'Férula',
  extraction: 'Extracción',
  implant: 'Implante',
  apicoectomy: 'Cirugía apical',
  root_canal_full: 'Endodoncia completa',
  root_canal_two_thirds: 'Endodoncia de dos tercios',
  root_canal_half: 'Endodoncia parcial',
  post: 'Perno',
  root_canal_overfill: 'Obturación radicular sobreextendida',
  bracket: 'Bracket',
  tube: 'Tubo',
  band: 'Banda',
  attachment: 'Atache',
  retainer: 'Retenedor',
};
export function DentalLegend({
  catalog,
  treatments,
}: { catalog: ConditionCatalog | null; treatments: TreatmentCatalog | null }): JSX.Element {
  return (
    <details className="text-sm">
      <summary className="min-h-[44px] cursor-pointer">Leyenda de conceptos</summary>
      <p className="my-2 text-muted">
        Activa: símbolo continuo y superficies marcadas. Resuelta: borde discontinuo. Registrada por
        error: símbolo atenuado con barra diagonal. Selección: contorno azul. Los detalles completos
        están en la lista.
      </p>
      <div className="space-y-3">
        <section aria-label="Leyenda Diagnóstico">
          <h4 className="font-semibold" aria-label="Conceptos de diagnóstico">
            Diagnóstico
          </h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {catalog?.conditions.map((entry) => (
              <li key={entry.code} className="flex items-center gap-2">
                <ConditionSymbol code={resolveCondition(catalog, entry.code).symbol} />
                {entry.label_es}
              </li>
            ))}
          </ul>
        </section>
        {groups.map((group) => (
          <section key={group.label} aria-label={`Leyenda ${group.label}`}>
            <h4 className="font-semibold">{group.label}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {group.types.map((type) => {
                const variant = treatments?.variants.find((v) => v.clinical_type === type);
                return variant ? (
                  <li key={type} className="flex items-center gap-2">
                    <TreatmentSymbol
                      variant={{ icon_key: type, palette_role: variant.palette_role }}
                    />
                    {CONCEPT_LABELS[type] ?? variant.label_es}
                  </li>
                ) : null;
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
