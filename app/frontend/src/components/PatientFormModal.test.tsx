import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Patient } from '../lib/api';
import { PatientFormModal } from './PatientFormModal';

describe('PatientFormModal', () => {
  it('loads contact in edit, rejects invalid contact and explicitly clears it', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: 'patient-1' });
    render(
      <PatientFormModal
        open
        mode="edit"
        patient={
          {
            id: 'patient-1',
            first_name: 'Ana',
            last_name: 'Pérez',
            rut_masked: '••.•••.678-5',
            last_evolution_at: null,
            phone: '123',
            email: 'a@b.com',
          } as Patient
        }
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Teléfono/)).toHaveValue('123');
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByLabelText(/Correo/)).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ phone: null, email: null, rut: null }),
      ),
    );
  });
  it('closes the birth-date calendar with Escape without closing the patient form', () => {
    const onClose = vi.fn();
    render(
      <PatientFormModal
        open
        mode="create"
        onClose={onClose}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir calendario para fecha de nacimiento' }),
    );
    expect(screen.getByRole('dialog', { name: 'Seleccionar fecha de nacimiento' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Seleccionar fecha de nacimiento' }), {
      key: 'Escape',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Seleccionar fecha de nacimiento' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nuevo paciente' })).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes a pristine form without confirmation', () => {
    const onClose = vi.fn();
    render(
      <PatientFormModal
        open
        mode="create"
        onClose={onClose}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: '¿Salir sin guardar?' })).not.toBeInTheDocument();
  });

  it('requires an explicit discard for dirty forms and preserves values while editing', () => {
    const onClose = vi.fn();
    render(
      <PatientFormModal
        open
        mode="create"
        onClose={onClose}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    const confirm = screen.getByRole('dialog', { name: '¿Salir sin guardar?' });
    fireEvent.click(confirm.querySelector('button') as HTMLButtonElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombres')).toHaveValue('Ana');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('explains an invalid checksum without changing the validation rule', () => {
    render(
      <PatientFormModal
        open
        mode="create"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const rut = screen.getByLabelText('RUT');
    fireEvent.change(rut, { target: { value: '13.456.456-7' } });
    fireEvent.blur(rut);

    expect(screen.getByText('El dígito verificador no coincide. Revisa el RUT.')).toBeVisible();
  });

  it('preserves the duplicate-patient resolution flow', async () => {
    const existing: Patient = {
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      rut_masked: '••.•••.678-5',
      last_evolution_at: null,
      birth_date: null,
    };
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError(409, { detail: { patient: existing } }));
    render(
      <PatientFormModal
        open
        mode="create"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Pérez' } });
    fireEvent.change(screen.getByLabelText('RUT'), { target: { value: '12.345.678-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }));

    await waitFor(() => expect(screen.getByText('Este paciente ya existe')).toBeVisible());
    expect(screen.getByText('Ana Pérez · ••.•••.678-5')).toBeVisible();
  });
});
