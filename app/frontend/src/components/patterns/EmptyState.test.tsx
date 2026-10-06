import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState heading hierarchy', () => {
  it('preserves the default page heading for existing consumers', () => {
    render(<EmptyState title="Sin conversaciones" />);
    expect(screen.getByRole('heading', { name: 'Sin conversaciones', level: 1 })).toBeVisible();
  });

  it('allows a section heading beneath an existing page heading', () => {
    render(
      <>
        <h1>Asistente clínico</h1>
        <EmptyState title="Prepara una evolución clínica" headingLevel={2} />
      </>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Prepara una evolución clínica', level: 2 }),
    ).toBeVisible();
  });
});
