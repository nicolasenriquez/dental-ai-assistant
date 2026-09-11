/**
 * Fail-first contract tests for mode-driven authentication bootstrap (task 1.2).
 *
 * Expected to FAIL (red) until task 1.5 lands. Seam contract for implementers:
 *
 * - `lib/authApi.getAuthConfig()` -> `{mode, google_client_id, drive_enabled,
 *   drive_auto_onboard}`; `lib/authApi.loginWithGoogle(credential)` posts
 *   `{"credential"}` to `POST /api/auth/google` with credentials include + JSON.
 * - `useAuth` exposes one discriminated bootstrap status:
 *   `loading-config | unauthenticated-local | unauthenticated-google |
 *   authenticating-google | establishing-session | checking-drive |
 *   authorizing-drive | preparing-workspace | ready | ready-without-drive | error`
 *   and a `loginWithGoogle(credential)` action.
 * - Google mode renders the official GIS button container (testid
 *   `google-signin-button`) with `ux_mode=popup`, `auto_select=false`,
 *   `use_fedcm_for_button=false`, no `login_uri`, no One Tap `prompt()`.
 * - Feedback copy: `Iniciando sesión…` immediately on activation, then
 *   `Cuenta verificada` after session establishment.
 */

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import * as authApi from '../lib/authApi';
import { Login } from '../pages/Login';

vi.mock('../lib/authApi', () => ({
  AuthError: class AuthError extends Error {
    status: number;
    rateLimitScope?: 'ip' | 'global';
    constructor(status: number, message: string, rateLimitScope?: 'ip' | 'global') {
      super(message);
      this.status = status;
      this.rateLimitScope = rateLimitScope;
    }
  },
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  getAuthConfig: vi.fn(),
  loginWithGoogle: vi.fn(),
}));

const localConfig = {
  mode: 'local',
  google_client_id: null,
  drive_enabled: false,
  drive_auto_onboard: false,
};

const googleConfig = {
  mode: 'google',
  google_client_id: 'test-client.apps.googleusercontent.com',
  drive_enabled: true,
  drive_auto_onboard: true,
};

const mePayload = {
  id: 'u1',
  email: 'ana@gmail.com',
  is_admin: false,
  messages_used_today: 0,
  messages_remaining_today: 25,
  rate_window_resets_at: null,
};

const getAuthConfigMock = authApi.getAuthConfig as unknown as Mock;
const meMock = authApi.me as unknown as Mock;
const loginWithGoogleMock = authApi.loginWithGoogle as unknown as Mock;

type HookWithBootstrap = {
  status: unknown;
  loginWithGoogle: (credential: string) => Promise<void>;
};

function asBootstrapHook(result: { current: unknown }): HookWithBootstrap {
  return result.current as HookWithBootstrap;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const gisInitialize = vi.fn();
const gisRenderButton = vi.fn();
const gisPrompt = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getAuthConfigMock.mockResolvedValue(localConfig);
  meMock.mockRejectedValue(new authApi.AuthError(401, 'not authenticated'));
  loginWithGoogleMock.mockResolvedValue(undefined);
  vi.stubGlobal('google', {
    accounts: {
      id: { initialize: gisInitialize, renderButton: gisRenderButton, prompt: gisPrompt },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAuth bootstrap state machine', () => {
  it('starts in loading-config before auth config resolves', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(asBootstrapHook(result).status).toBe('loading-config');
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('unauthenticated-local'));
  });

  it('reaches unauthenticated-google when backend config selects Google mode', async () => {
    getAuthConfigMock.mockResolvedValue(googleConfig);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('unauthenticated-google'));
  });

  it('walks authenticating-google -> establishing-session -> ready on credential success', async () => {
    getAuthConfigMock.mockResolvedValue(googleConfig);
    const loginGate = deferred<void>();
    loginWithGoogleMock.mockReturnValue(loginGate.promise);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('unauthenticated-google'));

    act(() => {
      void asBootstrapHook(result).loginWithGoogle('google-token');
    });
    expect(asBootstrapHook(result).status).toBe('authenticating-google');

    meMock.mockResolvedValue(mePayload);
    act(() => {
      loginGate.resolve();
    });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));
    expect(loginWithGoogleMock).toHaveBeenCalledWith('google-token');
  });
});

describe('Google mode login page', () => {
  it('renders only the official GIS button container, no local controls', async () => {
    getAuthConfigMock.mockResolvedValue(googleConfig);
    renderLogin();

    await waitFor(() => expect(screen.getByTestId('google-signin-button')).toBeInTheDocument());
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument();
  });

  it('configures GIS with popup callback, no One Tap, no auto-select, no login_uri', async () => {
    getAuthConfigMock.mockResolvedValue(googleConfig);
    renderLogin();

    await waitFor(() => expect(gisInitialize).toHaveBeenCalled());
    const options = gisInitialize.mock.calls[0][0] as Record<string, unknown>;
    expect(options.client_id).toBe('test-client.apps.googleusercontent.com');
    expect(options.ux_mode).toBe('popup');
    expect(options.auto_select).toBe(false);
    expect(options.use_fedcm_for_button).toBe(false);
    expect(options.login_uri).toBeUndefined();
    expect(options.callback).toBeTypeOf('function');
    expect(gisPrompt).not.toHaveBeenCalled();
    expect(gisRenderButton).toHaveBeenCalled();
    const buttonWidth = gisRenderButton.mock.calls[0][1].width as string;
    expect(buttonWidth).toMatch(/^\d+$/);
    expect(Number(buttonWidth)).toBeLessThanOrEqual(400);
  });

  it('hands the GIS credential to loginWithGoogle and shows immediate feedback', async () => {
    getAuthConfigMock.mockResolvedValue(googleConfig);
    const loginGate = deferred<void>();
    loginWithGoogleMock.mockReturnValue(loginGate.promise);
    renderLogin();

    await waitFor(() => expect(gisInitialize).toHaveBeenCalled());
    const options = gisInitialize.mock.calls[0][0] as { callback: (r: unknown) => void };

    act(() => {
      options.callback({ credential: 'tok-abc' });
    });
    expect(loginWithGoogleMock).toHaveBeenCalledWith('tok-abc');
    await waitFor(() => expect(screen.getByText('Iniciando sesión…')).toBeInTheDocument());

    meMock.mockResolvedValue(mePayload);
    act(() => {
      loginGate.resolve();
    });
    await waitFor(() => expect(screen.getByText('Cuenta verificada')).toBeInTheDocument());
  });

  it('shows a sanitized failure without technical credential details', async () => {
    getAuthConfigMock.mockResolvedValue(googleConfig);
    loginWithGoogleMock.mockRejectedValue(new Error('provider failure'));
    renderLogin();

    await waitFor(() => expect(gisInitialize).toHaveBeenCalled());
    const options = gisInitialize.mock.calls[0][0] as { callback: (r: unknown) => void };

    act(() => {
      options.callback({ credential: 'bad-tok' });
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('bad-tok');
    expect(alert.textContent).not.toContain('credential');
  });
});
