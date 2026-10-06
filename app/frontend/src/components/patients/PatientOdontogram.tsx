import { useId } from 'react';
import type { Dentition, PatientCondition } from '../../lib/api';
import { ConditionSymbol } from './ConditionSymbol';
import { ToothDrawing } from './ToothDrawing';
import { fdiTeeth, surfacePosition, surfaceShapes } from './toothGeometry';

interface OdontogramProps {
  dentition: Dentition;
  conditions: PatientCondition[];
  labels: Record<string, string>;
  selectedTooth: number;
  highlightedTooth: number;
  onSelect: (tooth: number) => void;
  onHighlight: (tooth: number) => void;
  disabled?: boolean;
  complete?: boolean;
}
export function PatientOdontogram({
  dentition,
  conditions,
  labels,
  selectedTooth,
  highlightedTooth,
  onSelect,
  onHighlight,
  disabled = false,
  complete = true,
}: OdontogramProps): JSX.Element {
  const titleId = useId();
  const teeth = fdiTeeth(dentition);
  const half = teeth.length / 2;
  const step = 720 / half;
  const describe = (tooth: number): string => {
    const records = conditions.filter(
      (item) => item.dentition === dentition && item.tooth_fdi === tooth,
    );
    return `Pieza ${tooth}: ${records.length ? records.map((item) => `${labels[item.condition_code] ?? item.condition_code}, ${item.status === 'active' ? 'Activa' : item.status === 'resolved' ? 'Resuelta' : 'Registrada por error'}, ${item.surfaces.join(', ') || 'sin superficies'}`).join('; ') : complete ? 'sin condiciones guardadas' : 'condiciones no confirmadas'}`;
  };
  return (
    <section aria-label="Odontograma" className="[container-type:inline-size]">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Odontograma FDI</h3>
        <p className="text-xs text-muted">Derecha del paciente ← · → Izquierda</p>
      </header>
      <div className="relative mx-auto max-w-[900px] rounded border border-border bg-surface p-2">
        <svg
          role="img"
          aria-labelledby={titleId}
          viewBox="0 0 760 365"
          className="block w-full text-muted"
        >
          <title id={titleId}>
            Odontograma {dentition === 'permanent' ? 'permanente' : 'temporal'}. Vista frontal.
            Consulta la lista para tipo, superficies y estado de cada condición.
          </title>
          <path
            d="M380 8v340"
            stroke="currentColor"
            strokeDasharray="4 6"
            className="text-border"
          />
          <text x="12" y="17" className="fill-muted" fontSize="11">
            Superior
          </text>
          <text x="12" y="358" className="fill-muted" fontSize="11">
            Inferior
          </text>
          {teeth.map((tooth, index) => {
            const upper = index < half;
            const x = 20 + (index % half) * step;
            const rows = conditions.filter(
              (item) => item.dentition === dentition && item.tooth_fdi === tooth,
            );
            const activeSurfaces = Array.from(
              new Set(
                rows.filter((item) => item.status === 'active').flatMap((item) => item.surfaces),
              ),
            );
            return (
              <g
                key={tooth}
                data-arch-tooth={tooth}
                transform={`translate(${x} ${upper ? 22 : 208})`}
              >
                <title>{describe(tooth)}</title>
                {selectedTooth === tooth && (
                  <rect
                    data-draft-tooth={tooth}
                    x="-1"
                    y="-2"
                    width={step - 2}
                    height="142"
                    rx="5"
                    fill="none"
                    className="stroke-primary"
                    strokeWidth="2"
                  />
                )}
                {highlightedTooth === tooth && (
                  <rect
                    x="1"
                    y="0"
                    width={step - 6}
                    height="137"
                    rx="4"
                    fill="none"
                    className="stroke-muted"
                    strokeDasharray="2 3"
                  />
                )}
                <g>
                  <ToothDrawing
                    tooth={tooth}
                    surfaces={activeSurfaces}
                    orientation={upper ? 'upper' : 'lower'}
                  />
                  {rows
                    .filter((item) => item.status === 'resolved')
                    .flatMap((item) =>
                      item.surfaces.map((surface) => (
                        <path
                          key={`${item.id}:${surface}`}
                          data-resolved-surface={surface}
                          d={surfaceShapes[surfacePosition(surface, tooth)]}
                          transform={upper ? undefined : 'translate(0 -122)'}
                          fill="none"
                          className="stroke-muted"
                          strokeWidth="1.2"
                          strokeDasharray="2 2"
                        />
                      )),
                    )}
                </g>
                <text
                  x="21"
                  y={upper ? 144 : -29}
                  textAnchor="middle"
                  fontSize="12"
                  className="fill-foreground"
                >
                  {tooth}
                </text>
                {rows.map((item, k) => (
                  <g
                    key={item.id}
                    data-condition-id={item.id}
                    strokeDasharray={item.status === 'resolved' ? '3 2' : undefined}
                    transform={`translate(${(k % 3) * 13} ${122 + Math.floor(k / 3) * 13}) scale(.55)`}
                    className={item.status === 'active' ? 'text-primary' : 'text-muted'}
                  >
                    <ConditionSymbol
                      code={item.condition_code}
                      resolved={item.status === 'resolved'}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
        <div
          className={`absolute inset-x-2 inset-y-5 hidden gap-y-8 [@container(min-width:720px)]:grid ${dentition === 'permanent' ? 'grid-cols-[repeat(16,minmax(0,1fr))]' : 'grid-cols-[repeat(10,minmax(0,1fr))]'}`}
        >
          {teeth.map((tooth) => (
            <button
              key={tooth}
              type="button"
              aria-label={describe(tooth)}
              aria-pressed={selectedTooth === tooth}
              disabled={disabled}
              className="min-h-[44px] min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              onMouseEnter={() => onHighlight(tooth)}
              onMouseLeave={() => onHighlight(0)}
              onFocus={() => onHighlight(tooth)}
              onBlur={() => onHighlight(0)}
              onClick={() => onSelect(tooth)}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Activa: símbolo continuo y superficies marcadas. Resuelta: símbolo con borde discontinuo.
        Borrador: contorno azul. Los detalles completos están en la lista.
      </p>
    </section>
  );
}
