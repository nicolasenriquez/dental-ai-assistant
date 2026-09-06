import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ApiError, type Patient } from '../lib/api';
import { normalizeClinicalDateInput, parseClinicalDateInput } from '../lib/clinicalDate';
import {
  formatRutInput,
  formatRutInputWithSelection,
  isCompleteRutInput,
  validateRut,
} from '../lib/rut';

export interface PatientFormValues {
  first_name: string;
  last_name: string;
  rut: string | null;
  birth_date: string | null;
}

interface PatientFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  patient?: Patient | null;
  onClose: () => void;
  onSubmit: (values: PatientFormValues) => Promise<Patient>;
  onSuccess: (patient: Patient) => void;
}

type PatientField = 'first_name' | 'last_name' | 'rut' | 'birth_date';
type PatientFieldErrors = Partial<Record<PatientField, string>>;

function duplicatePatient(error: unknown): Patient | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409 ||
    typeof error.body !== 'object' ||
    !error.body
  ) {
    return null;
  }

  const detail = (error.body as { detail?: { patient?: Patient } }).detail;
  return detail?.patient ?? null;
}

function getInitialValues(mode: PatientFormModalProps['mode'], patient?: Patient | null) {
  return {
    first_name: patient?.first_name ?? '',
    last_name: patient?.last_name ?? '',
    rut: mode === 'create' ? '' : null,
    birth_date: patient?.birth_date?.split('-').reverse().join('/') ?? null,
  } satisfies PatientFormValues;
}

export function PatientFormModal({
  open,
  mode,
  patient,
  onClose,
  onSubmit,
  onSuccess,
}: PatientFormModalProps) {
  const firstInput = useRef<HTMLInputElement>(null);
  const lastInput = useRef<HTMLInputElement>(null);
  const rutInput = useRef<HTMLInputElement>(null);
  const birthDateInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const rutSelection = useRef<{ start: number; end: number } | null>(null);
  const [form, setForm] = useState<PatientFormValues>(() => getInitialValues(mode, patient));
  const [initialForm, setInitialForm] = useState<PatientFormValues>(() =>
    getInitialValues(mode, patient),
  );
  const [rutChangeOpen, setRutChangeOpen] = useState(mode === 'create');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<PatientFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Patient | null>(null);

  useEffect(() => {
    if (open) {
      const nextForm = getInitialValues(mode, patient);
      restoreFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setForm(nextForm);
      setInitialForm(nextForm);
      setRutChangeOpen(mode === 'create');
      rutSelection.current = null;
      setFieldErrors({});
      setFormError(null);
      setDuplicate(null);
      firstInput.current?.focus();
    } else if (restoreFocus.current?.isConnected) {
      restoreFocus.current.focus();
      restoreFocus.current = null;
    }
  }, [mode, open, patient?.id]);

  useLayoutEffect(() => {
    const selection = rutSelection.current;
    const input = rutInput.current;
    if (!selection || !input) return;

    input.setSelectionRange(selection.start, selection.end);
    rutSelection.current = null;
  });

  const dirty =
    form.first_name !== initialForm.first_name ||
    form.last_name !== initialForm.last_name ||
    form.birth_date !== initialForm.birth_date ||
    (mode === 'create' ? form.rut !== initialForm.rut : rutChangeOpen);

  const requestClose = () => {
    if (submitting) return;
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Quieres cerrar el formulario?')) {
      return;
    }
    onClose();
  };

  const clearFieldError = (field: PatientField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const focusFirstInvalid = (errors: PatientFieldErrors) => {
    const firstInvalid = (['first_name', 'last_name', 'rut', 'birth_date'] as PatientField[]).find(
      (field) => errors[field],
    );
    if (!firstInvalid) return;

    window.requestAnimationFrame(() => {
      if (firstInvalid === 'first_name') firstInput.current?.focus();
      if (firstInvalid === 'last_name') lastInput.current?.focus();
      if (firstInvalid === 'rut') rutInput.current?.focus();
      if (firstInvalid === 'birth_date') birthDateInput.current?.focus();
    });
  };

  const validate = () => {
    const errors: PatientFieldErrors = {};
    const firstName = form.first_name.trim().replace(/\s+/g, ' ');
    const lastName = form.last_name.trim().replace(/\s+/g, ' ');
    const rut = form.rut?.trim() ?? '';
    const birthDate = normalizeClinicalDateInput(form.birth_date ?? '');
    const parsedBirthDate = birthDate ? parseClinicalDateInput(birthDate) : null;

    if (!firstName) errors.first_name = 'Ingresa los nombres.';
    if (!lastName) errors.last_name = 'Ingresa los apellidos.';
    if (mode === 'create' || rutChangeOpen) {
      if (!rut) errors.rut = 'Ingresa el RUT.';
      else if (!validateRut(rut)) errors.rut = 'Ingresa un RUT válido.';
    }
    if (birthDate && !parsedBirthDate) {
      errors.birth_date = 'Ingresa una fecha válida, no futura, como dd/mm/aaaa.';
    }

    return {
      errors,
      values: {
        first_name: firstName,
        last_name: lastName,
        rut: mode === 'create' || rutChangeOpen ? formatRutInput(rut, true) : null,
        birth_date: parsedBirthDate,
      } satisfies PatientFormValues,
    };
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const result = validate();
    setFieldErrors(result.errors);
    setFormError(null);
    if (Object.keys(result.errors).length > 0) {
      focusFirstInvalid(result.errors);
      return;
    }

    setSubmitting(true);
    setForm(result.values);
    try {
      const updated = await onSubmit(result.values);
      onSuccess(updated);
    } catch (caught) {
      const existing = duplicatePatient(caught);
      if (mode === 'create' && existing) {
        setDuplicate(existing);
      } else if (caught instanceof ApiError && caught.status === 409) {
        setFormError('Ese RUT ya pertenece a otro paciente.');
      } else {
        setFormError(
          caught instanceof ApiError && caught.status === 422
            ? 'Revisa los datos del paciente.'
            : mode === 'edit'
              ? 'No pudimos actualizar el paciente.'
              : 'No pudimos crear el paciente.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-dialog-title"
      onKeyDown={handleDialogKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <form
        onSubmit={submit}
        noValidate
        className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Cerrar"
          disabled={submitting}
          onClick={requestClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-xl text-[var(--text-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          ×
        </button>
        <h2 id="patient-dialog-title" className="text-lg font-semibold">
          {mode === 'create' ? 'Nuevo paciente' : 'Editar paciente'}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {mode === 'create'
            ? 'Crea la ficha básica. Podrás agregar una evolución después.'
            : 'Actualiza los datos básicos sin modificar sus evoluciones clínicas.'}
        </p>

        {duplicate ? (
          <div className="mt-4">
            <p className="font-medium">Este paciente ya existe</p>
            <p className="mt-2 text-[var(--text-secondary)]">
              {duplicate.first_name} {duplicate.last_name} · {duplicate.rut_masked}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded border border-[var(--border)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancelar
              </button>
              <button type="button" onClick={() => onSuccess(duplicate)} className="primary-button">
                Abrir paciente
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="text-sm">
                <span className="text-[var(--text-secondary)]">Nombres</span>
                <input
                  ref={firstInput}
                  id="patient-first-name"
                  required
                  value={form.first_name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({ ...current, first_name: value }));
                    clearFieldError('first_name');
                  }}
                  aria-describedby={fieldErrors.first_name ? 'patient-first-name-error' : undefined}
                  aria-invalid={fieldErrors.first_name ? true : undefined}
                  disabled={submitting}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
                {fieldErrors.first_name && (
                  <p
                    id="patient-first-name-error"
                    role="alert"
                    className="mt-1 text-sm text-[var(--danger)]"
                  >
                    {fieldErrors.first_name}
                  </p>
                )}
              </label>
              <label className="text-sm">
                <span className="text-[var(--text-secondary)]">Apellidos</span>
                <input
                  ref={lastInput}
                  id="patient-last-name"
                  required
                  value={form.last_name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({ ...current, last_name: value }));
                    clearFieldError('last_name');
                  }}
                  aria-describedby={fieldErrors.last_name ? 'patient-last-name-error' : undefined}
                  aria-invalid={fieldErrors.last_name ? true : undefined}
                  disabled={submitting}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
                {fieldErrors.last_name && (
                  <p
                    id="patient-last-name-error"
                    role="alert"
                    className="mt-1 text-sm text-[var(--danger)]"
                  >
                    {fieldErrors.last_name}
                  </p>
                )}
              </label>

              <div className="text-sm">
                <span className="text-[var(--text-secondary)]">RUT</span>
                {mode === 'edit' && !rutChangeOpen ? (
                  <div className="mt-1 flex min-h-10 items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-2)] px-3">
                    <span>{patient?.rut_masked}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRutChangeOpen(true);
                        setForm((current) => ({ ...current, rut: '' }));
                      }}
                      className="text-xs text-[var(--accent)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      Cambiar RUT
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={rutInput}
                      id="patient-rut"
                      aria-label="RUT"
                      required
                      inputMode="text"
                      value={form.rut ?? ''}
                      onChange={(event) => {
                        const input = event.currentTarget;
                        const selectionStart = input.selectionStart ?? input.value.length;
                        const selectionEnd = input.selectionEnd ?? selectionStart;
                        const formatted = formatRutInputWithSelection(
                          input.value,
                          selectionStart,
                          selectionEnd,
                        );
                        rutSelection.current = {
                          start: formatted.selectionStart,
                          end: formatted.selectionEnd,
                        };
                        setForm((current) => ({ ...current, rut: formatted.value }));
                        clearFieldError('rut');
                      }}
                      onBlur={(event) => {
                        const formatted = formatRutInput(event.currentTarget.value, true);
                        setForm((current) => ({ ...current, rut: formatted }));
                        if (isCompleteRutInput(formatted) && !validateRut(formatted)) {
                          setFieldErrors((current) => ({
                            ...current,
                            rut: 'Ingresa un RUT válido.',
                          }));
                        } else {
                          clearFieldError('rut');
                        }
                      }}
                      aria-describedby={fieldErrors.rut ? 'patient-rut-error' : undefined}
                      aria-invalid={fieldErrors.rut ? true : undefined}
                      disabled={submitting}
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    />
                    {fieldErrors.rut && (
                      <p
                        id="patient-rut-error"
                        role="alert"
                        className="mt-1 text-sm text-[var(--danger)]"
                      >
                        {fieldErrors.rut}
                      </p>
                    )}
                    {mode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRutChangeOpen(false);
                          setForm((current) => ({ ...current, rut: null }));
                          clearFieldError('rut');
                        }}
                        className="mt-1 text-xs text-[var(--accent)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        Conservar RUT actual
                      </button>
                    )}
                  </>
                )}
              </div>

              <label className="text-sm">
                <span className="text-[var(--text-secondary)]">Fecha de nacimiento</span>
                <span className="ml-2 text-xs text-[var(--text-tertiary)]">Opcional</span>
                <input
                  ref={birthDateInput}
                  id="patient-birth-date"
                  aria-label="Fecha de nacimiento"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="dd/mm/aaaa"
                  value={form.birth_date ?? ''}
                  onChange={(event) => {
                    const value = normalizeClinicalDateInput(event.currentTarget.value);
                    setForm((current) => ({ ...current, birth_date: value || null }));
                    clearFieldError('birth_date');
                  }}
                  onBlur={(event) => {
                    const value = normalizeClinicalDateInput(event.currentTarget.value);
                    setForm((current) => ({ ...current, birth_date: value || null }));
                    if (value.length === 10 && !parseClinicalDateInput(value)) {
                      setFieldErrors((current) => ({
                        ...current,
                        birth_date: 'Ingresa una fecha válida, no futura, como dd/mm/aaaa.',
                      }));
                    } else {
                      clearFieldError('birth_date');
                    }
                  }}
                  aria-describedby={fieldErrors.birth_date ? 'patient-birth-date-error' : undefined}
                  aria-invalid={fieldErrors.birth_date ? true : undefined}
                  disabled={submitting}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
                {fieldErrors.birth_date && (
                  <p
                    id="patient-birth-date-error"
                    role="alert"
                    className="mt-1 text-sm text-[var(--danger)]"
                  >
                    {fieldErrors.birth_date}
                  </p>
                )}
              </label>
            </div>
            {formError && (
              <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
                {formError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={submitting}
                className="rounded border border-[var(--border)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="primary-button">
                {submitting
                  ? mode === 'create'
                    ? 'Creando...'
                    : 'Guardando...'
                  : mode === 'create'
                    ? 'Crear paciente'
                    : 'Guardar cambios'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
