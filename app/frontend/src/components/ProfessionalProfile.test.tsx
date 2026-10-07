import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProfessionalProfile } from './ProfessionalProfile';

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { professional_display_name: null }, refresh: mocks.refresh }),
}));
vi.mock('../lib/authApi', () => ({ updateProfessionalProfile: mocks.save }));

it('retains text after failure, retries the declared name and permits clearing it', async () => {
  const close = vi.fn();
  mocks.save
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ professional_display_name: 'Dra. Ríos' });
  render(<ProfessionalProfile onClose={close} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre profesional' }), {
    target: { value: '  Dra. Ríos  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox')).toHaveValue('  Dra. Ríos  ');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mocks.save).toHaveBeenLastCalledWith('Dra. Ríos');
  expect(mocks.refresh).toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(null));
});
