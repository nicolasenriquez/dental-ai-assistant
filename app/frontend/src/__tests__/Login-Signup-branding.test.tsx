/**
 * Tests for Login and Signup page branding header.
 *
 * Verifies that the branding header (logo, title, tagline) is rendered
 * consistently on both pages, and that the forms render correctly.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Login } from '../pages/Login';
import { Signup } from '../pages/Signup';

// Mock useAuth to provide a valid context
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'unauthenticated-local',
    user: null,
    error: null,
    authConfig: null,
    login: vi.fn(),
    signup: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock authApi module to avoid network calls
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
  login: vi.fn().mockResolvedValue({ id: 'test', email: 'test@test' }),
  signup: vi.fn().mockResolvedValue({ id: 'test', email: 'test@test' }),
  logout: vi.fn().mockResolvedValue(undefined),
  me: vi.fn().mockResolvedValue({
    id: 'test',
    email: 'test@test',
    is_admin: false,
    messages_used_today: 0,
    messages_remaining_today: 25,
    rate_window_resets_at: null,
  }),
}));

const brandingText = 'Pregúntale cualquier cosa a la biblioteca de YouTube de Cole Medin';

describe('Login page', () => {
  it('renders branding header with logo, title, and tagline', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dental AI Assistant')).toBeInTheDocument();
    expect(screen.getByText(brandingText)).toBeInTheDocument();
  });

  it('renders the login form with all required fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('renders a link to the signup page', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /regístrate/i })).toHaveAttribute('href', '/signup');
  });
});

describe('Signup page', () => {
  it('renders branding header with logo, title, and tagline', () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dental AI Assistant')).toBeInTheDocument();
    expect(screen.getByText(brandingText)).toBeInTheDocument();
  });

  it('renders the signup form with all required fields', () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /crear cuenta/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrarse/i })).toBeInTheDocument();
  });

  it('renders a link to the login page', () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login');
  });
});

describe('Login and Signup branding consistency', () => {
  it('both pages render identical branding structure', () => {
    const { container: loginContainer } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const { container: signupContainer } = render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>,
    );

    // Both should have the same decorative tooth icon
    const loginLogo = loginContainer.querySelector('svg[aria-hidden="true"]');
    const signupLogo = signupContainer.querySelector('svg[aria-hidden="true"]');
    expect(loginLogo).toBeInTheDocument();
    expect(signupLogo).toBeInTheDocument();
    expect(loginLogo).toHaveAttribute('viewBox', '0 0 24 24');
    expect(signupLogo).toHaveAttribute('viewBox', '0 0 24 24');

    // Both should have Dental AI Assistant title
    const loginTitle = loginContainer.querySelector('.text-xl.font-semibold');
    const signupTitle = signupContainer.querySelector('.text-xl.font-semibold');
    expect(loginTitle?.textContent).toBe('Dental AI Assistant');
    expect(signupTitle?.textContent).toBe('Dental AI Assistant');

    // Both should have the tagline
    expect(loginContainer.textContent).toContain(brandingText);
    expect(signupContainer.textContent).toContain(brandingText);
  });
});
