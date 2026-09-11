/**
 * Fail-first contract tests for the authentication-to-Drive bootstrap (task 3.1).
 *
 * Expected to FAIL (red) until task 3.2 lands. Seam contract for implementers:
 *
 * - `lib/api.getDriveStatus()` -> `{configured, status, workspace?}` and
 *   `lib/api.startDriveOAuth()` -> `{authorization_url}` (POST with session
 *   credentials included).
 * - After authoritative `/api/auth/me` hydration, `useAuth` walks
 *   `checking-drive` -> `ready` (healthy connection) or -> `authorizing-drive`
 *   (disconnected + `drive_auto_onboard`: POST oauth/start, then
 *   `window.location.assign(authorization_url)` exactly once, never GET/form/
 *   browser-built URL) or -> `ready-without-drive` (disconnected without
 *   auto-onboard, denied/mismatch/provider-error callback result, or failure).
 * - A handled callback result in the URL (`?result=consent_denied|account_
 *   mismatch|provider_error`) never re-triggers auto-onboarding.
 * - `connectDrive()` re-runs the explicit handoff from `ready-without-drive`.
 * - `AppShell` renders the `ready-without-drive` banner with copy
 *   `Google Drive no está conectado`, `Puedes continuar utilizando Dental AI
 *   Assistant. Conecta Drive cuando quieras trabajar con documentos.` and one
 *   `Conectar Drive` action.
 */

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import * as api from '../lib/api';
import * as authApi from '../lib/authApi';

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

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getDriveStatus: vi.fn(),
    startDriveOAuth: vi.fn(),
  };
});

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

const localConfigDriveNoAuto = {
  mode: 'local',
  google_client_id: null,
  drive_enabled: true,
  drive_auto_onboard: false,
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
const loginMock = authApi.login as unknown as Mock;
const loginWithGoogleMock = authApi.loginWithGoogle as unknown as Mock;
const getDriveStatusMock = api.getDriveStatus as unknown as Mock;
const startDriveOAuthMock = api.startDriveOAuth as unknown as Mock;

type HookWithBootstrap = {
  status: unknown;
  user: unknown;
  connectDrive: () => Promise<void>;
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

function stubLocation(search = ''): Mock {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search, assign },
  });
  return assign;
}

const connectedStatus = { configured: true, status: 'connected' };
const disconnectedStatus = { configured: true, status: 'disconnected' };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthConfigMock.mockResolvedValue(googleConfig);
  meMock.mockResolvedValue(mePayload);
  loginMock.mockResolvedValue(undefined);
  loginWithGoogleMock.mockResolvedValue(undefined);
  getDriveStatusMock.mockResolvedValue(connectedStatus);
  startDriveOAuthMock.mockResolvedValue({
    authorization_url: 'https://accounts.google.com/o/oauth2/auth?x=1',
  });
});

describe('useAuth drive bootstrap', () => {
  it('walks checking-drive -> ready for a healthy connection without touching OAuth', async () => {
    const gate = deferred<{ configured: boolean; status: string }>();
    getDriveStatusMock.mockReturnValue(gate.promise);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('checking-drive'));
    act(() => {
      gate.resolve(connectedStatus);
    });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));
    expect(getDriveStatusMock).toHaveBeenCalledTimes(1);
    expect(startDriveOAuthMock).not.toHaveBeenCalled();
  });

  it('starts explicit provider consent once when disconnected and auto-onboard is on', async () => {
    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    const startGate = deferred<{ authorization_url: string }>();
    startDriveOAuthMock.mockReturnValue(startGate.promise);
    const assign = stubLocation();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('authorizing-drive'));
    act(() => {
      startGate.resolve({ authorization_url: 'https://accounts.google.com/o/oauth2/auth?x=1' });
    });
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign.mock.calls[0][0]).toBe('https://accounts.google.com/o/oauth2/auth?x=1');
  });

  it('enters ready-without-drive when disconnected and auto-onboard is off', async () => {
    getAuthConfigMock.mockResolvedValue(localConfigDriveNoAuto);
    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready-without-drive'));
    expect(startDriveOAuthMock).not.toHaveBeenCalled();
  });

  it.each(['consent_denied', 'account_mismatch', 'provider_error'])(
    'never re-triggers auto-onboarding after handled callback result %s',
    async (callbackResult) => {
      getDriveStatusMock.mockResolvedValue(disconnectedStatus);
      stubLocation(`?result=${callbackResult}`);
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready-without-drive'));
      expect(startDriveOAuthMock).not.toHaveBeenCalled();
      expect(asBootstrapHook(result).user).not.toBeNull();
    },
  );

  it('walks preparing-workspace -> ready after result=connected', async () => {
    const gate = deferred<{ configured: boolean; status: string }>();
    getDriveStatusMock.mockReturnValue(gate.promise);
    stubLocation('?result=connected');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('preparing-workspace'));
    act(() => {
      gate.resolve(connectedStatus);
    });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));
    expect(startDriveOAuthMock).not.toHaveBeenCalled();
  });

  it('skips Drive entirely when drive is disabled', async () => {
    getAuthConfigMock.mockResolvedValue(localConfig);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));
    expect(getDriveStatusMock).not.toHaveBeenCalled();
  });

  it('preserves the session and lands ready-without-drive when OAuth start fails', async () => {
    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    startDriveOAuthMock.mockRejectedValue(
      new api.ApiError(503, { error: 'GOOGLE_DRIVE_NOT_CONFIGURED' }),
    );
    stubLocation();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready-without-drive'));
    expect(asBootstrapHook(result).user).toEqual(mePayload);
  });

  it('lands ready-without-drive when the Drive status check fails', async () => {
    getDriveStatusMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready-without-drive'));
  });

  it('runs the drive bootstrap after local login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));

    const loginResult = loginMock.mockResolvedValue(undefined);
    act(() => {
      void (result.current as { login: (e: string, p: string) => Promise<void> }).login(
        'ana@gmail.com',
        'pw',
      );
    });
    await loginResult;

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));
    expect(getDriveStatusMock).toHaveBeenCalled();
  });

  it('runs the drive bootstrap after Google login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready'));

    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    stubLocation();
    const googleResult = loginWithGoogleMock.mockResolvedValue(undefined);
    act(() => {
      void (result.current as { loginWithGoogle: (c: string) => Promise<void> }).loginWithGoogle(
        'google-token',
      );
    });
    await googleResult;

    await waitFor(() => expect(asBootstrapHook(result).status).toBe('authorizing-drive'));
    expect(startDriveOAuthMock).toHaveBeenCalledTimes(1);
  });

  it('connectDrive re-runs the explicit handoff exactly once', async () => {
    getAuthConfigMock.mockResolvedValue(localConfigDriveNoAuto);
    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    const assign = stubLocation();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready-without-drive'));

    let settled = false;
    act(() => {
      void asBootstrapHook(result)
        .connectDrive()
        .then(() => {
          settled = true;
        });
    });
    await waitFor(() => expect(settled).toBe(true));

    expect(startDriveOAuthMock).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toBe('https://accounts.google.com/o/oauth2/auth?x=1');
  });

  it('connectDrive failure returns to ready-without-drive with the session intact', async () => {
    getAuthConfigMock.mockResolvedValue(localConfigDriveNoAuto);
    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    startDriveOAuthMock.mockRejectedValue(
      new api.ApiError(409, { error: 'GOOGLE_DRIVE_ACCOUNT_MISMATCH' }),
    );
    stubLocation();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(asBootstrapHook(result).status).toBe('ready-without-drive'));

    await act(async () => {
      await expect(asBootstrapHook(result).connectDrive()).rejects.toBeInstanceOf(api.ApiError);
    });

    expect(asBootstrapHook(result).status).toBe('ready-without-drive');
    expect(asBootstrapHook(result).user).toEqual(mePayload);
  });
});

describe('ready-without-drive banner', () => {
  function renderShell() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell showConversations={false}>contenido</AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('shows the denial copy and Conectar Drive action, then starts the handoff on click', async () => {
    getAuthConfigMock.mockResolvedValue(localConfigDriveNoAuto);
    getDriveStatusMock.mockResolvedValue(disconnectedStatus);
    const assign = stubLocation();
    renderShell();

    await screen.findByText('Google Drive no está conectado');
    expect(
      screen.getByText(
        'Puedes continuar utilizando Dental AI Assistant. Conecta Drive cuando quieras trabajar con documentos.',
      ),
    ).toBeInTheDocument();

    const connect = screen.getByRole('button', { name: 'Conectar Drive' });
    act(() => {
      connect.click();
    });

    await waitFor(() => expect(startDriveOAuthMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  });

  it('does not render when the connection is healthy', async () => {
    renderShell();
    await screen.findByText('contenido');
    expect(screen.queryByText('Google Drive no está conectado')).not.toBeInTheDocument();
  });
});
