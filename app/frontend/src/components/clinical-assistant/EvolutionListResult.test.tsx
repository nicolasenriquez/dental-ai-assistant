import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { formatClinicalDateTime } from '../../lib/clinicalDate';
import { EvolutionListResult } from './EvolutionListResult';

describe('EvolutionListResult', () => {
  it('distinguishes same-day evolutions and preserves their exact record links', () => {
    const morning = '2026-10-05T09:30:00';
    const afternoon = '2026-10-05T16:45:00';
    render(
      <MemoryRouter>
        <EvolutionListResult
          payload={{
            patient_id: 'patient-1',
            evolutions: [
              { id: 'morning', evolution_at: morning },
              { id: 'afternoon', evolution_at: afternoon },
            ],
          }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: `Ver evolución del ${formatClinicalDateTime(morning)}` }),
    ).toHaveAttribute('href', '/patients/patient-1/evolutions/morning');
    expect(
      screen.getByRole('link', { name: `Ver evolución del ${formatClinicalDateTime(afternoon)}` }),
    ).toHaveAttribute('href', '/patients/patient-1/evolutions/afternoon');
    const links = screen.getAllByRole('link');
    expect(links[0].textContent).toContain('09:30');
    expect(links[1].textContent).toContain('16:45');
  });
});
