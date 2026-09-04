import { fireEvent, render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

class BrokenChild extends Component<{ children?: ReactNode }> {
  render(): ReactNode {
    throw new Error('synthetic render failure');
  }
}

describe('AppErrorBoundary', () => {
  it('offers recovery instead of leaving the application blank', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar esta vista');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
