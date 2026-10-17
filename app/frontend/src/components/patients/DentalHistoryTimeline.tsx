import { type KeyboardEvent, useRef } from 'react';
import { formatClinicalDayShort } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';

interface DentalHistoryTimelineProps {
  dates: string[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  loadedEvents: number;
  totalEvents: number;
}

const CURRENT_OPTION = 'actual';

// Discrete named-button range control over the loaded clinical dates plus the current position.
export function DentalHistoryTimeline({
  dates,
  selectedDay,
  onSelectDay,
  hasMore,
  loadingOlder,
  onLoadOlder,
  loadedEvents,
  totalEvents,
}: DentalHistoryTimelineProps): JSX.Element | null {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const options: (string | null)[] = [null];
  for (const day of dates) if (!options.includes(day)) options.push(day);
  if (selectedDay && !options.includes(selectedDay)) options.push(selectedDay);
  if (options.length === 1 && selectedDay === null) return null;
  const selectedIndex = options.findIndex((option) => option === selectedDay);
  const activeIndex = selectedIndex === -1 ? 0 : selectedIndex;
  const keyOf = (option: string | null): string => option ?? CURRENT_OPTION;
  const move = (event: KeyboardEvent<HTMLDivElement>, index: number): void => {
    const next =
      event.key === 'ArrowRight'
        ? Math.min(index + 1, options.length - 1)
        : event.key === 'ArrowLeft'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : null;
    if (next === null || next === index) return;
    event.preventDefault();
    const option = options[next];
    onSelectDay(option);
    buttons.current.get(keyOf(option))?.focus();
  };
  const range = dates.length
    ? `Fechas cargadas: ${formatClinicalDayShort(dates[dates.length - 1])} – ${formatClinicalDayShort(dates[0])}`
    : 'Sin fechas cargadas';
  return (
    <section aria-label="Fechas del historial" className="space-y-2">
      <h4 className="font-medium">Fechas registradas</h4>
      <div
        role="group"
        aria-label="Seleccionar fecha clínica"
        className="flex flex-wrap gap-2"
        onKeyDown={(event) => move(event, activeIndex)}
      >
        {options.map((option) => (
          <button
            key={keyOf(option)}
            ref={(node) => {
              if (node) buttons.current.set(keyOf(option), node);
              else buttons.current.delete(keyOf(option));
            }}
            type="button"
            aria-pressed={selectedDay === option}
            tabIndex={selectedIndex === options.indexOf(option) ? 0 : -1}
            className="min-h-[44px] rounded border border-border px-3 text-sm aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            onClick={() => onSelectDay(option)}
          >
            {option ? <time dateTime={option}>{formatClinicalDayShort(option)}</time> : 'Actual'}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {range} · Eventos cargados: {loadedEvents} de {totalEvents}
      </p>
      {hasMore ? (
        <Button variant="clinicalSecondary" disabled={loadingOlder} onClick={onLoadOlder}>
          {loadingOlder ? 'Cargando fechas anteriores…' : 'Cargar fechas anteriores'}
        </Button>
      ) : null}
    </section>
  );
}
