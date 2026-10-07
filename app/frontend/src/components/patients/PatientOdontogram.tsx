import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { ConditionCatalog, Dentition, PatientCondition, ToothSurface } from '../../lib/api';
import { resolveCondition, surfaceDescription } from '../../lib/odontogramPresentation';
import { ConditionSymbol } from './ConditionSymbol';
import { ToothDrawing } from './ToothDrawing';
import { fdiQuadrants, fdiTeeth, surfacePosition, surfaceShapes } from './toothGeometry';

const quadrantLabels = [
  'Superior derecha',
  'Superior izquierda',
  'Inferior derecha',
  'Inferior izquierda',
];

interface OdontogramProps {
  controls?: ReactNode;
  dentition: Dentition;
  conditions: PatientCondition[];
  labels: Record<string, string>;
  catalog?: ConditionCatalog | null;
  selectedTooth: number;
  highlightedTooth: number;
  onSelect: (tooth: number, anchor?: HTMLElement, surface?: ToothSurface) => void;
  surfaceCodes?: ToothSurface[];
  onHighlight: (tooth: number) => void;
  disabled?: boolean;
  complete?: boolean;
}
function quadrantOf(tooth: number, dentition: Dentition): number {
  const quadrants = fdiQuadrants(dentition);
  const candidate = Math.floor(tooth / 10);
  return quadrants.includes(candidate) ? candidate : quadrants[0];
}
export function PatientOdontogram({
  controls,
  dentition,
  conditions,
  labels,
  catalog,
  selectedTooth,
  highlightedTooth,
  onSelect,
  surfaceCodes = [],
  onHighlight,
  disabled = false,
  complete = true,
}: OdontogramProps): JSX.Element {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const activateTooth = (event: MouseEvent<HTMLButtonElement>, tooth: number): void => {
    // The transparent lateral target also covers the drawn occlusal view. Resolve the
    // actual anatomical path under a pointer; keyboard surfaces have named 44px controls.
    if (event.detail && surfaceCodes.length) {
      const paths = chartRef.current?.querySelectorAll<SVGGeometryElement>(
        `[data-arch-tooth="${tooth}"] [data-surface]`,
      );
      for (const path of paths ?? []) {
        const code = path.getAttribute('data-surface') as ToothSurface;
        const matrix = path.getScreenCTM();
        if (!matrix || !surfaceCodes.includes(code)) continue;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        if (path.isPointInFill(point)) {
          onSelect(tooth, event.currentTarget, code);
          return;
        }
      }
    }
    onSelect(tooth, event.currentTarget);
  };
  const [narrow, setNarrow] = useState(false);
  const [quadrant, setQuadrant] = useState(() => quadrantOf(selectedTooth, dentition));
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      // ponytail: leave room for chart padding and sixteen 44px targets.
      setNarrow((entries[0]?.contentRect.width ?? 0) < 744);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setQuadrant(quadrantOf(selectedTooth, dentition));
  }, [selectedTooth, dentition]);
  const teeth = fdiTeeth(dentition);
  const half = teeth.length / 2;
  const step = 720 / half;
  const labelFor = (code: string): string => labels[code] ?? resolveCondition(catalog, code).label;
  const describeRecords = (tooth: number): string => {
    const records = conditions.filter(
      (item) => item.dentition === dentition && item.tooth_fdi === tooth,
    );
    return records.length
      ? records
          .map(
            (item) =>
              `${labelFor(item.condition_code)}, ${item.status === 'active' ? 'Activa' : item.status === 'resolved' ? 'Resuelta' : 'Registrada por error'}, ${surfaceDescription(catalog, item.condition_code, item.surfaces)}`,
          )
          .join('; ')
      : complete
        ? 'sin condiciones guardadas'
        : 'condiciones no confirmadas';
  };
  const describe = (tooth: number): string => `Pieza ${tooth}: ${describeRecords(tooth)}`;
  return (
    <section ref={sectionRef} aria-label="Odontograma" className="[container-type:inline-size]">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Odontograma FDI</h3>
        <p className="text-xs text-muted">Derecha del paciente ← · → Izquierda</p>
      </header>
      {controls && <div className="mb-3">{controls}</div>}
      <div className="relative mx-auto max-w-[900px] rounded border border-border bg-surface p-2">
        <svg
          ref={chartRef}
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
                      code={resolveCondition(catalog, item.condition_code).symbol}
                      resolved={item.status === 'resolved'}
                      error={item.status === 'entered_in_error'}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
        <div
          className={`absolute inset-x-2 inset-y-5 hidden gap-y-8 [@container(min-width:744px)]:grid ${dentition === 'permanent' ? 'grid-cols-[repeat(16,minmax(0,1fr))]' : 'grid-cols-[repeat(10,minmax(0,1fr))]'}`}
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
              onClick={(event) => activateTooth(event, tooth)}
            />
          ))}
        </div>
      </div>
      {narrow && (
        <div className="mt-2 space-y-2">
          <div
            role="group"
            aria-label={`Cuadrantes ${dentition === 'permanent' ? 'permanentes' : 'temporales'}`}
            className="flex flex-wrap gap-2"
          >
            {fdiQuadrants(dentition).map((candidate, index) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={quadrant === candidate}
                onClick={() => setQuadrant(candidate)}
                className="min-h-[44px] min-w-[44px] rounded border border-border px-3 text-sm aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {quadrantLabels[index]}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label={`Piezas del cuadrante ${quadrant}`}
            className="flex flex-wrap gap-2"
          >
            {teeth
              .filter((tooth) => Math.floor(tooth / 10) === quadrant)
              .map((tooth) => (
                <button
                  key={tooth}
                  type="button"
                  data-quadrant-tooth={tooth}
                  aria-label={`Seleccionar pieza ${tooth}: ${describeRecords(tooth)}`}
                  aria-pressed={selectedTooth === tooth}
                  disabled={disabled}
                  className="min-h-[44px] min-w-[44px] rounded border border-border px-3 text-sm aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  onMouseEnter={() => onHighlight(tooth)}
                  onMouseLeave={() => onHighlight(0)}
                  onFocus={() => onHighlight(tooth)}
                  onBlur={() => onHighlight(0)}
                  onClick={(event) => onSelect(tooth, event.currentTarget)}
                >
                  Pieza {tooth}
                </button>
              ))}
          </div>
        </div>
      )}
      {surfaceCodes.length > 0 && (
        <div
          aria-label="Vista oclusal"
          className="mt-3 flex gap-3 overflow-x-auto rounded border border-border p-2"
        >
          {teeth.map((tooth) => (
            <div
              key={tooth}
              className="shrink-0"
              role="group"
              aria-label={`Superficies de pieza ${tooth}`}
            >
              <p className="text-center text-sm">{tooth}</p>
              <div className="grid h-36 w-36 grid-cols-3 grid-rows-3 rounded-full border border-border bg-surface">
                {surfaceCodes.map((code) => {
                  const position = surfacePosition(code, tooth);
                  const cell =
                    position === 'V'
                      ? 'col-start-2 row-start-1'
                      : position === 'L'
                        ? 'col-start-2 row-start-3'
                        : position === 'M'
                          ? 'col-start-1 row-start-2'
                          : position === 'D'
                            ? 'col-start-3 row-start-2'
                            : 'col-start-2 row-start-2';
                  const label = {
                    M: 'Mesial',
                    D: 'Distal',
                    O: 'Oclusal',
                    V: 'Vestibular',
                    L: 'Lingual',
                  }[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-label={`Pieza ${tooth} · ${label} (${code})`}
                      disabled={disabled}
                      className={`min-h-11 min-w-11 rounded border border-border text-sm hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-primary ${cell}`}
                      onMouseEnter={() => onHighlight(tooth)}
                      onMouseLeave={() => onHighlight(0)}
                      onFocus={() => onHighlight(tooth)}
                      onBlur={() => onHighlight(0)}
                      onClick={(event) => onSelect(tooth, event.currentTarget, code)}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Activa: símbolo continuo y superficies marcadas. Resuelta: borde discontinuo. Registrada por
        error: símbolo atenuado con barra diagonal. Borrador: contorno azul. Los detalles completos
        están en la lista.
      </p>
    </section>
  );
}
