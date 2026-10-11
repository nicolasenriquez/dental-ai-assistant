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

  describe('coincident timestamps', () => {
    const patientId = 'patient-1';
    const coincident = '2026-10-10T12:00:00';
    const different = '2026-10-10T15:30:00';

    function renderPayload(evolutions: unknown[]) {
      return render(
        <MemoryRouter>
          <EvolutionListResult payload={{ patient_id: patientId, evolutions }} />
        </MemoryRouter>,
      );
    }

    it('labels each coincident destination with a stable ordinal in payload order', () => {
      renderPayload([
        { id: 'evolution-a', evolution_at: coincident },
        { id: 'evolution-b', evolution_at: coincident },
        { id: 'evolution-c', evolution_at: different },
      ]);
      const links = screen.getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual([
        `Ver evolución 1 del ${formatClinicalDateTime(coincident)}`,
        `Ver evolución 2 del ${formatClinicalDateTime(coincident)}`,
        `Ver evolución del ${formatClinicalDateTime(different)}`,
      ]);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/patients/patient-1/evolutions/evolution-a',
        '/patients/patient-1/evolutions/evolution-b',
        '/patients/patient-1/evolutions/evolution-c',
      ]);
    });

    it('keeps coincident ordinals stable when invalid rows are skipped', () => {
      renderPayload([
        { id: 'evolution-a', evolution_at: coincident },
        { evolution_at: coincident },
        null,
        { id: 'evolution-b', evolution_at: coincident },
        'invalid',
      ]);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(links.map((link) => link.textContent)).toEqual([
        `Ver evolución 1 del ${formatClinicalDateTime(coincident)}`,
        `Ver evolución 2 del ${formatClinicalDateTime(coincident)}`,
      ]);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/patients/patient-1/evolutions/evolution-a',
        '/patients/patient-1/evolutions/evolution-b',
      ]);
    });

    it('renders the empty state without links for empty or invalid payloads', () => {
      const { unmount } = renderPayload([]);
      expect(screen.getByText('No hay evoluciones anteriores disponibles.')).toBeVisible();
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      unmount();
      render(
        <MemoryRouter>
          <EvolutionListResult
            payload={{ evolutions: [{ id: 'evolution-a', evolution_at: coincident }] }}
          />
        </MemoryRouter>,
      );
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
  });
});
