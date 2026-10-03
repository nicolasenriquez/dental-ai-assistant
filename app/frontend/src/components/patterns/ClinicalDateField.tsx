import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { type KeyboardEvent, type Ref, useEffect, useId, useRef, useState } from 'react';
import {
  formatClinicalDate,
  normalizeClinicalDateInput,
  parseClinicalDateInput,
} from '../../lib/clinicalDate';

interface ClinicalDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  id?: string;
  optional?: boolean;
  disabled?: boolean;
  error?: string | null;
  shortcuts?: boolean;
}

const months = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const weekdays = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function makeDate(year: number, month: number, day: number): Date {
  const value = new Date(0);
  value.setFullYear(year, month, day);
  value.setHours(0, 0, 0, 0);
  return value;
}

function shiftMonth(date: Date, monthsToMove: number): Date {
  const first = makeDate(date.getFullYear(), date.getMonth() + monthsToMove, 1);
  const lastDay = makeDate(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return makeDate(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

function calendarDate(value: string): Date | null {
  const iso = parseClinicalDateInput(value);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return makeDate(year, month - 1, day);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayAfterToday(value: Date): boolean {
  const today = new Date();
  return (
    makeDate(value.getFullYear(), value.getMonth(), value.getDate()).getTime() >
    makeDate(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  );
}

export function ClinicalDateField({
  label,
  value,
  onChange,
  onBlur,
  inputRef,
  id,
  optional = false,
  disabled = false,
  error = null,
  shortcuts = false,
}: ClinicalDateFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(() => calendarDate(value) ?? new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = calendarDate(value) ?? new Date();
    return makeDate(selected.getFullYear(), selected.getMonth(), 1);
  });
  const [yearInput, setYearInput] = useState(String(visibleMonth.getFullYear()));
  const calendarRef = useRef<HTMLDivElement>(null);
  const selected = calendarDate(value);
  const today = new Date();
  const firstDay = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = makeDate(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const focusDay =
    activeDate.getFullYear() === visibleMonth.getFullYear() &&
    activeDate.getMonth() === visibleMonth.getMonth()
      ? activeDate.getDate()
      : 1;

  useEffect(() => {
    if (!open) return;
    const initial = calendarDate(value) ?? new Date();
    setActiveDate(initial);
    setVisibleMonth(makeDate(initial.getFullYear(), initial.getMonth(), 1));
  }, [open]);

  useEffect(() => {
    setYearInput(String(visibleMonth.getFullYear()));
  }, [visibleMonth]);

  useEffect(() => {
    if (
      !open ||
      activeDate.getFullYear() !== visibleMonth.getFullYear() ||
      activeDate.getMonth() !== visibleMonth.getMonth()
    )
      return;
    const frame = window.requestAnimationFrame(() => {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${activeDate.getDate()}"]`)
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeDate, open, visibleMonth]);

  const focusDate = (date: Date) => {
    setActiveDate(date);
    setVisibleMonth(makeDate(date.getFullYear(), date.getMonth(), 1));
  };

  const handleDayKey = (event: KeyboardEvent<HTMLButtonElement>, day: number) => {
    const date = makeDate(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    let next: Date | null = null;
    if (event.key === 'ArrowLeft') next = makeDate(date.getFullYear(), date.getMonth(), day - 1);
    if (event.key === 'ArrowRight') next = makeDate(date.getFullYear(), date.getMonth(), day + 1);
    if (event.key === 'ArrowUp') next = makeDate(date.getFullYear(), date.getMonth(), day - 7);
    if (event.key === 'ArrowDown') next = makeDate(date.getFullYear(), date.getMonth(), day + 7);
    if (event.key === 'Home')
      next = makeDate(date.getFullYear(), date.getMonth(), day - ((date.getDay() + 6) % 7));
    if (event.key === 'End')
      next = makeDate(date.getFullYear(), date.getMonth(), day + 6 - ((date.getDay() + 6) % 7));
    if (event.key === 'PageUp') next = shiftMonth(date, event.shiftKey ? -12 : -1);
    if (event.key === 'PageDown') next = shiftMonth(date, event.shiftKey ? 12 : 1);
    if (!next) return;
    event.preventDefault();
    if (!dayAfterToday(next) && next.getFullYear() >= 1) focusDate(next);
  };

  const applyYear = () => {
    const year = Number(yearInput);
    if (!Number.isInteger(year) || year < 1 || year > today.getFullYear()) {
      setYearInput(String(visibleMonth.getFullYear()));
      return;
    }
    const month =
      year === today.getFullYear()
        ? Math.min(visibleMonth.getMonth(), today.getMonth())
        : visibleMonth.getMonth();
    setVisibleMonth(makeDate(year, month, 1));
  };

  const choose = (date: Date) => {
    onChange(formatClinicalDate(date));
    setOpen(false);
  };

  const rows = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => row * 7 + column - firstDay + 1),
  );

  return (
    <div className="clinical-date-field">
      <label htmlFor={fieldId} className="clinical-date-field__label">
        {label}
        {optional && <span className="clinical-date-field__optional">Opcional</span>}
      </label>
      <div className="clinical-date-field__control">
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="dd/mm/aaaa"
          value={value}
          onChange={(event) => onChange(normalizeClinicalDateInput(event.currentTarget.value))}
          onBlur={() => onBlur?.(value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          disabled={disabled}
        />
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label={`Abrir calendario para ${label.toLowerCase()}`}
              disabled={disabled}
            >
              <CalendarDays aria-hidden="true" size={18} />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="clinical-calendar"
              aria-describedby={undefined}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                window.requestAnimationFrame(() => {
                  calendarRef.current
                    ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${focusDay}"]`)
                    ?.focus();
                });
              }}
            >
              <div className="clinical-calendar__header">
                <Dialog.Title>Seleccionar {label.toLowerCase()}</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Cerrar calendario">
                    <X aria-hidden="true" size={18} />
                  </button>
                </Dialog.Close>
              </div>
              <div className="clinical-calendar__navigation">
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() =>
                    setVisibleMonth(
                      makeDate(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft aria-hidden="true" size={18} />
                </button>
                <select
                  aria-label="Mes"
                  value={visibleMonth.getMonth()}
                  onChange={(event) =>
                    setVisibleMonth(
                      makeDate(visibleMonth.getFullYear(), Number(event.target.value), 1),
                    )
                  }
                >
                  {months.map((month, index) => (
                    <option
                      key={month}
                      value={index}
                      disabled={
                        visibleMonth.getFullYear() === today.getFullYear() &&
                        index > today.getMonth()
                      }
                    >
                      {month}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Año"
                  type="text"
                  inputMode="numeric"
                  min={1}
                  max={today.getFullYear()}
                  value={yearInput}
                  onChange={(event) =>
                    setYearInput(event.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  onBlur={applyYear}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyYear();
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  disabled={
                    visibleMonth.getFullYear() === today.getFullYear() &&
                    visibleMonth.getMonth() >= today.getMonth()
                  }
                  onClick={() =>
                    setVisibleMonth(
                      makeDate(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </div>
              <div ref={calendarRef}>
                <table
                  role="grid"
                  aria-label={`${months[visibleMonth.getMonth()]} de ${visibleMonth.getFullYear()}`}
                >
                  <thead>
                    <tr>
                      {weekdays.map((day) => (
                        <th key={day} scope="col">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${visibleMonth.getTime()}-${index}`}>
                        {row.map((day, column) => {
                          const date = makeDate(
                            visibleMonth.getFullYear(),
                            visibleMonth.getMonth(),
                            day,
                          );
                          const inMonth = day >= 1 && day <= daysInMonth;
                          const future = inMonth && dayAfterToday(date);
                          return (
                            <td
                              key={column}
                              aria-selected={inMonth && selected ? sameDay(date, selected) : false}
                            >
                              {inMonth && (
                                <button
                                  type="button"
                                  data-calendar-day={day}
                                  tabIndex={day === focusDay ? 0 : -1}
                                  aria-label={new Intl.DateTimeFormat('es-CL', {
                                    dateStyle: 'full',
                                  }).format(date)}
                                  aria-current={sameDay(date, today) ? 'date' : undefined}
                                  disabled={future}
                                  onKeyDown={(event) => handleDayKey(event, day)}
                                  onClick={() => choose(date)}
                                >
                                  {day}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shortcuts && (
                <div className="clinical-calendar__shortcuts">
                  <button type="button" onClick={() => choose(today)}>
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      choose(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
                    }
                  >
                    Ayer
                  </button>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="clinical-date-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
