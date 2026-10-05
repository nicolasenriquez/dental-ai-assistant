import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { AdminVideos } from './AdminVideos';

vi.mock('../hooks/useAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useAuth')>()),
  useAuth: () => ({ status: 'ready', user: { is_admin: true } }),
}));
vi.mock('../hooks/useToast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

describe('admin library recovery', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('distinguishes load failure from empty library and recovers', async () => {
    vi.spyOn(api, 'listAdminVideos')
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ videos: [] });
    render(
      <MemoryRouter>
        <AdminVideos />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la biblioteca');
    expect(screen.queryByText(/Aún no hay videos/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/Aún no hay videos/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps previous results visible when refresh fails', async () => {
    vi.spyOn(api, 'listAdminVideos')
      .mockResolvedValueOnce({
        videos: [
          {
            id: 'video',
            title: 'Saved video',
            description: '',
            url: '',
            created_at: '',
            chunk_count: 1,
          },
        ],
      })
      .mockRejectedValueOnce(new Error('Offline'));
    render(
      <MemoryRouter>
        <AdminVideos />
      </MemoryRouter>,
    );
    await screen.findByText('Saved video');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('resultados anteriores'),
    );
    expect(screen.getByText('Saved video')).toBeInTheDocument();
  });
});
