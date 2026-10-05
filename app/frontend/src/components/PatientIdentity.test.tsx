import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Patient } from '../lib/api';
import { PatientIdentity } from './PatientIdentity';

const patient: Patient = {
  id: 'patient-1',
  first_name: 'Juan',
  last_name: 'Perez',
  rut_masked: '••.•••.678-9',
  last_evolution_at: null,
  birth_date: '1985-01-02',
};

describe('PatientIdentity', () => {
  it('shows age, birth date, and only the masked RUT', () => {
    render(<PatientIdentity patient={patient} />);

    expect(screen.getByText('Nacimiento 02/01/1985')).toBeVisible();
    expect(screen.getByText(/\d+ años/)).toBeVisible();
    expect(screen.getByText('RUT ••.•••.678-9')).toBeVisible();
    expect(screen.queryByRole('button', { name: /RUT completo/ })).not.toBeInTheDocument();
  });

  it('makes a missing birth date explicit', () => {
    render(<PatientIdentity patient={{ ...patient, birth_date: null }} />);

    expect(screen.getByText('Nacimiento no registrado')).toBeVisible();
  });
});
