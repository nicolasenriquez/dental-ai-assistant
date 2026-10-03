import { X } from 'lucide-react';
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
import { ConfirmDialog } from './ConfirmDialog';
import { ClinicalDateField } from './patterns/ClinicalDateField';
import { Button } from './ui/Button';

export interface PatientFormValues {
  first_name: string;
  last_name: string;
  rut: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
}

interface PatientFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  patient?: Patient | null;
  onClose: () => void;
  onSubmit: (values: PatientFormValues) => Promise<Patient>;
  onSuccess: (patient: Patient) => void;
}

type PatientField = 'first_name' | 'last_name' | 'rut' | 'birth_date' | 'phone' | 'email';
type PatientFieldErrors = Partial<Record<PatientField, string>>;

function rutError(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Ingresa el RUT.';
  if (!isCompleteRutInput(trimmed)) {
    return 'Ingresa el RUT completo, incluido el dígito verificador.';
  }
  return validateRut(trimmed) ? '' : 'El dígito verificador no coincide. Revisa el RUT.';
}

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
    phone: patient?.phone ?? null,
    email: patient?.email ?? null,
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
  const phoneInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
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
  const [closePromptOpen, setClosePromptOpen] = useState(false);

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
      setClosePromptOpen(false);
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
    form.phone !== initialForm.phone ||
    form.email !== initialForm.email ||
    (mode === 'create' ? form.rut !== initialForm.rut : rutChangeOpen);

  const requestClose = () => {
    if (submitting) return;
    if (dirty) {
      setClosePromptOpen(true);
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
    const firstInvalid = (
      ['first_name', 'last_name', 'rut', 'birth_date', 'phone', 'email'] as PatientField[]
    ).find((field) => errors[field]);
    if (!firstInvalid) return;

    window.requestAnimationFrame(() => {
      if (firstInvalid === 'first_name') firstInput.current?.focus();
      if (firstInvalid === 'last_name') lastInput.current?.focus();
      if (firstInvalid === 'rut') rutInput.current?.focus();
      if (firstInvalid === 'birth_date') birthDateInput.current?.focus();
      if (firstInvalid === 'phone') phoneInput.current?.focus();
      if (firstInvalid === 'email') emailInput.current?.focus();
    });
  };

  const validate = () => {
    const errors: PatientFieldErrors = {};
    const firstName = form.first_name.trim().replace(/\s+/g, ' ');
    const lastName = form.last_name.trim().replace(/\s+/g, ' ');
    const rut = form.rut?.trim() ?? '';
    const birthDate = normalizeClinicalDateInput(form.birth_date ?? '');
    const parsedBirthDate = birthDate ? parseClinicalDateInput(birthDate) : null;
    const phone = form.phone?.trim() || null;
    const email = form.email?.trim() || null;
    if (
      phone &&
      (phone.length > 40 ||
        !/^\+?[0-9 ()-]+$/.test(phone) ||
        !/^[0-9]{1,15}$/.test(phone.replace(/[^0-9]/g, '')))
    )
      errors.phone = 'Ingresa un teléfono de 1 a 15 dígitos, sin extensiones.';
    if (
      email &&
      (email.length > 254 ||
        [...email].some(
          (character) =>
            character.charCodeAt(0) < 32 ||
            (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159),
        ) ||
        !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email))
    )
      errors.email = 'Ingresa un correo válido, como nombre@dominio.cl.';

    if (!firstName) errors.first_name = 'Ingresa los nombres.';
    if (!lastName) errors.last_name = 'Ingresa los apellidos.';
    if (mode === 'create' || rutChangeOpen) {
      const error = rutError(rut);
      if (error) errors.rut = error;
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
        phone,
        email,
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
    setForm({
      ...result.values,
      birth_date: result.values.birth_date?.split('-').reverse().join('/') ?? null,
    });
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
        className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Cerrar"
          disabled={submitting}
          onClick={requestClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-xl text-[var(--text-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          <X aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
        <h2 id="patient-dialog-title" className="text-lg font-semibold">
          {mode === 'create' ? 'Nuevo paciente' : 'Editar paciente'}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {mode === 'create'
            ? 'Crea la ficha básica. Podrás agregar una evolución después.'
            : 'Actualiza los datos básicos sin modificar sus evoluciones clínicas.'}
        </p>
        <p className="mt-2 text-xs text-muted">Nombres, apellidos y RUT son obligatorios.</p>

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
              <Button variant="primary" onClick={() => onSuccess(duplicate)}>
                Abrir paciente
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,272px),1fr))] gap-4">
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
                            rut: rutError(formatted),
                          }));
                        } else if (formatted && !isCompleteRutInput(formatted)) {
                          setFieldErrors((current) => ({
                            ...current,
                            rut: rutError(formatted),
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

              <ClinicalDateField
                id="patient-birth-date"
                inputRef={birthDateInput}
                label="Fecha de nacimiento"
                optional
                value={form.birth_date ?? ''}
                disabled={submitting}
                error={fieldErrors.birth_date}
                onChange={(value) => {
                  setForm((current) => ({ ...current, birth_date: value || null }));
                  clearFieldError('birth_date');
                }}
                onBlur={(value) => {
                  if (value.length === 10 && !parseClinicalDateInput(value)) {
                    setFieldErrors((current) => ({
                      ...current,
                      birth_date: 'Ingresa una fecha válida, no futura, como dd/mm/aaaa.',
                    }));
                  } else {
                    clearFieldError('birth_date');
                  }
                }}
              />
              {(['phone', 'email'] as const).map((field) => (
                <label key={field} className="text-sm">
                  <span className="text-muted">
                    {field === 'phone' ? 'Teléfono' : 'Correo'}{' '}
                    <span className="text-xs">Opcional</span>
                  </span>
                  <input
                    ref={field === 'phone' ? phoneInput : emailInput}
                    type={field === 'phone' ? 'tel' : 'email'}
                    value={form[field] ?? ''}
                    disabled={submitting}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({ ...current, [field]: value }));
                      clearFieldError(field);
                    }}
                    aria-invalid={fieldErrors[field] ? true : undefined}
                    aria-describedby={fieldErrors[field] ? `patient-${field}-error` : undefined}
                    className="mt-1 min-h-11 w-full rounded border border-border bg-surface-raised px-3 py-2 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  {fieldErrors[field] && (
                    <p
                      id={`patient-${field}-error`}
                      role="alert"
                      className="mt-1 text-sm text-danger"
                    >
                      {fieldErrors[field]}
                    </p>
                  )}
                </label>
              ))}
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
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting
                  ? mode === 'create'
                    ? 'Creando...'
                    : 'Guardando...'
                  : mode === 'create'
                    ? 'Crear paciente'
                    : 'Guardar cambios'}
              </Button>
            </div>
          </>
        )}
      </form>
      {closePromptOpen && (
        <ConfirmDialog
          title="¿Salir sin guardar?"
          description="Tienes cambios sin guardar. Si sales ahora, se perderán."
          confirmLabel="Salir sin guardar"
          cancelLabel="Continuar editando"
          tone="danger"
          onConfirm={() => {
            setClosePromptOpen(false);
            onClose();
          }}
          onCancel={() => setClosePromptOpen(false)}
        />
      )}
    </div>
  );
}
