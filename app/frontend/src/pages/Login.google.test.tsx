import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

const googleButton = vi.hoisted(() => vi.fn());
const googleInitialize = vi.hoisted(() => vi.fn());
const authConfig = vi.hoisted(() => ({ google_client_id: 'test-client-id', drive_enabled: true }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'unauthenticated-google',
    error: null,
    authConfig,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'google');
  googleButton.mockClear();
  googleInitialize.mockClear();
  authConfig.drive_enabled = true;
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
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Iniciar sesión' })).toBeVisible();
    expect(screen.getByText(/Google Drive es opcional/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Correo electrónico' })).not.toBeInTheDocument();
    await waitFor(() => expect(googleButton).toHaveBeenCalledOnce());
    expect(googleButton).toHaveBeenCalledWith(
      screen.getByTestId('google-signin-button'),
      expect.objectContaining({ locale: 'es' }),
    );
    expect(googleInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'test-client-id', ux_mode: 'popup' }),
    );
  });

  it('omits Drive guidance when the integration is disabled', () => {
    authConfig.drive_enabled = false;
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Google Drive es opcional/)).not.toBeInTheDocument();
  });

  it('fits the Google button after resizing without reinitializing sign-in', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    Object.defineProperty(window, 'google', {
      configurable: true,
      value: { accounts: { id: { initialize: googleInitialize, renderButton: googleButton } } },
    });
    const { unmount } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await waitFor(() => expect(callbacks).toHaveLength(1));
    const container = screen.getByTestId('google-signin-button');
    Object.defineProperty(container, 'clientWidth', { value: 280, configurable: true });
    callbacks[0]([], {} as ResizeObserver);
    expect(googleButton).toHaveBeenLastCalledWith(
      container,
      expect.objectContaining({ width: '280', locale: 'es' }),
    );
    expect(googleInitialize).toHaveBeenCalledOnce();
    callbacks[0]([], {} as ResizeObserver);
    expect(googleButton).toHaveBeenCalledTimes(2);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
