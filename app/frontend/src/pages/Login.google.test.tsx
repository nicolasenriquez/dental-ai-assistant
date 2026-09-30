import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

const googleButton = vi.hoisted(() => vi.fn());
const googleInitialize = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'unauthenticated-google',
    error: null,
    authConfig: { google_client_id: 'test-client-id' },
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
  }),
}));

afterEach(() => {
  Reflect.deleteProperty(window, 'google');
  googleButton.mockClear();
  googleInitialize.mockClear();
});

describe('Login with Google', () => {
  it('keeps Google as the configured sign-in method inside the clinical layout', async () => {
    Object.defineProperty(window, 'google', {
      configurable: true,
      value: { accounts: { id: { initialize: googleInitialize, renderButton: googleButton } } },
    });
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('Tu espacio clínico, con el paciente en contexto.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Correo electrónico' })).not.toBeInTheDocument();
    await waitFor(() => expect(googleButton).toHaveBeenCalledOnce());
    expect(googleInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'test-client-id', ux_mode: 'popup' }),
    );
  });
});
