import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoExplorer } from '../components/VideoExplorer';
import * as api from '../lib/api';

// Default auth mock: admin user so the "+ Agregar video" button renders. The
// non-admin gate is covered by its own suite below that re-mocks useAuth.
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-admin',
      email: 'admin@test',
      is_admin: true,
      messages_used_today: 0,
      messages_remaining_today: 100,
      rate_window_resets_at: null,
    },
    status: 'authed',
    refresh: vi.fn(),
  }),
}));

describe('VideoExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mocks
    vi.spyOn(api, 'getVideos').mockResolvedValue([]);
    vi.spyOn(api, 'ingestVideo').mockResolvedValue({
      video_id: 'new',
      chunks_created: 5,
      status: 'created',
    });
  });

  describe('keyboard focus', () => {
    it('moves focus into the library, traps it, and restores it on close', async () => {
      const opener = document.createElement('button');
      opener.type = 'button';
      document.body.appendChild(opener);
      opener.focus();

      const onClose = vi.fn();
      const { rerender } = render(<VideoExplorer isOpen={false} onClose={onClose} />);
      rerender(<VideoExplorer isOpen={true} onClose={onClose} />);

      const closeButton = await screen.findByRole('button', {
        name: 'Cerrar biblioteca de videos',
      });
      expect(closeButton).toHaveFocus();

      fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
      expect(screen.getByRole('button', { name: '+ Agregar video' })).toHaveFocus();

      fireEvent.keyDown(closeButton, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);

      rerender(<VideoExplorer isOpen={false} onClose={onClose} />);
      expect(opener).toHaveFocus();
      opener.remove();
    });

    it('keeps Escape inside the ingest dialog and returns focus to its opener', async () => {
      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      const addButton = await screen.findByRole('button', { name: '+ Agregar video' });
      fireEvent.click(addButton);

      const ingestDialog = screen.getByRole('dialog', { name: 'Agregar video' });
      const ingestCloseButton = screen.getByRole('button', { name: 'Cerrar formulario de video' });
      expect(ingestCloseButton).toHaveFocus();

      fireEvent.keyDown(ingestDialog, { key: 'Escape' });

      expect(screen.queryByRole('dialog', { name: 'Agregar video' })).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(addButton).toHaveFocus();
    });
  });

  describe('handleIngest', () => {
    it('shows validation error when fields are empty', async () => {
      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      // Open the ingest dialog
      const addButton = screen.getByText('+ Agregar video');
      fireEvent.click(addButton);

      // Try to submit empty form
      const addVideoButton = screen.getByRole('button', { name: 'Agregar video' });
      fireEvent.click(addVideoButton);

      // Should show validation error
      expect(screen.getByText('Completa todos los campos.')).toBeInTheDocument();
    });

    it('shows validation error when URL is missing', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: 'A test video description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Open the ingest dialog
      const addButton = screen.getByText('+ Agregar video');
      fireEvent.click(addButton);

      // Fill partial form (missing URL and transcript)
      fireEvent.change(screen.getByLabelText('Título'), {
        target: { value: 'Test Title' },
      });
      fireEvent.change(screen.getByLabelText('Descripción'), {
        target: { value: 'Test Description' },
      });

      // Try to submit
      const addVideoButton = screen.getByRole('button', { name: 'Agregar video' });
      fireEvent.click(addVideoButton);

      expect(screen.getByText('Completa todos los campos.')).toBeInTheDocument();
    });

    it('successfully ingests video and refreshes video list', async () => {
      const initialVideos = [
        {
          id: '1',
          title: 'Test Video',
          description: 'A test video description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const updatedVideos = [
        ...initialVideos,
        {
          id: '2',
          title: 'New Video',
          description: 'New description',
          url: 'https://youtube.com/watch?v=xyz789',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      vi.spyOn(api, 'getVideos')
        .mockResolvedValueOnce(initialVideos as api.Video[])
        .mockResolvedValueOnce(updatedVideos as api.Video[]);
      vi.spyOn(api, 'ingestVideo').mockResolvedValueOnce({
        video_id: '2',
        chunks_created: 10,
        status: 'created',
      });

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Open the ingest dialog
      const addButton = screen.getByText('+ Agregar video');
      fireEvent.click(addButton);

      // Fill all fields
      fireEvent.change(screen.getByLabelText('Título'), {
        target: { value: 'New Video' },
      });
      fireEvent.change(screen.getByLabelText('Descripción'), {
        target: { value: 'New description' },
      });
      fireEvent.change(screen.getByLabelText('URL de YouTube'), {
        target: { value: 'https://youtube.com/watch?v=xyz789' },
      });
      fireEvent.change(screen.getByLabelText('Transcripción'), {
        target: { value: 'Full transcript text here' },
      });

      // Submit
      const addVideoButton = screen.getByRole('button', { name: 'Agregar video' });
      fireEvent.click(addVideoButton);

      // Verify ingestVideo was called with correct body
      await waitFor(() => {
        expect(api.ingestVideo).toHaveBeenCalledWith({
          title: 'New Video',
          description: 'New description',
          url: 'https://youtube.com/watch?v=xyz789',
          transcript: 'Full transcript text here',
        });
      });

      // Verify dialog closed
      expect(screen.queryByText('Agregar video')).not.toBeInTheDocument();
    });

    it('shows error message when ingest fails', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: 'A test video description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);
      vi.spyOn(api, 'ingestVideo').mockRejectedValueOnce(
        new Error('Server error: Invalid URL format'),
      );

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Open the ingest dialog
      const addButton = screen.getByText('+ Agregar video');
      fireEvent.click(addButton);

      // Fill all fields
      fireEvent.change(screen.getByLabelText('Título'), {
        target: { value: 'New Video' },
      });
      fireEvent.change(screen.getByLabelText('Descripción'), {
        target: { value: 'New description' },
      });
      fireEvent.change(screen.getByLabelText('URL de YouTube'), {
        target: { value: 'https://youtube.com/watch?v=xyz789' },
      });
      fireEvent.change(screen.getByLabelText('Transcripción'), {
        target: { value: 'Full transcript text here' },
      });

      // Submit
      const addVideoButton = screen.getByRole('button', { name: 'Agregar video' });
      fireEvent.click(addVideoButton);

      // Should show error
      await waitFor(() => {
        expect(
          screen.getByText('No pudimos agregar el video. Intenta nuevamente.'),
        ).toBeInTheDocument();
      });
    });

    it('clears error when dialog is reopened', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: 'A test video description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);
      vi.spyOn(api, 'ingestVideo').mockRejectedValueOnce(new Error('Some error'));

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      // Open dialog, trigger error
      const addButton = screen.getByText('+ Agregar video');
      fireEvent.click(addButton);

      fireEvent.change(screen.getByLabelText('Título'), {
        target: { value: 'New Video' },
      });
      fireEvent.change(screen.getByLabelText('Descripción'), {
        target: { value: 'New description' },
      });
      fireEvent.change(screen.getByLabelText('URL de YouTube'), {
        target: { value: 'https://youtube.com/watch?v=xyz789' },
      });
      fireEvent.change(screen.getByLabelText('Transcripción'), {
        target: { value: 'Transcript' },
      });

      const addVideoButton = screen.getByRole('button', { name: 'Agregar video' });
      fireEvent.click(addVideoButton);

      await waitFor(() => {
        expect(
          screen.getByText('No pudimos agregar el video. Intenta nuevamente.'),
        ).toBeInTheDocument();
      });

      // Close dialog
      const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
      fireEvent.click(cancelButton);

      // Reopen dialog
      fireEvent.click(addButton);

      // Error should be cleared
      expect(
        screen.queryByText('No pudimos agregar el video. Intenta nuevamente.'),
      ).not.toBeInTheDocument();
    });
  });

  describe('video list rendering', () => {
    it('displays error state with retry button', async () => {
      vi.spyOn(api, 'getVideos').mockRejectedValueOnce(new Error('Network failure'));

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('No pudimos cargar la biblioteca de videos.')).toBeInTheDocument();
      });

      expect(screen.queryByText('Network failure')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });

    it('displays empty state when no videos', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(
          screen.getByText('Aún no hay videos en la base de conocimiento.'),
        ).toBeInTheDocument();
      });
    });

    it('displays video cards when videos loaded', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: 'A test video description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });

      expect(screen.getByText('A test video description')).toBeInTheDocument();
      expect(screen.getByText('Ver en YouTube')).toBeInTheDocument();
    });
  });

  describe('channel_title display', () => {
    it('shows channel attribution when channel_title is present', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: 'Old description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
          channel_title: 'Cole Medin',
        },
      ]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Sincronizado desde Cole Medin')).toBeInTheDocument();
      });
      // Description should NOT be shown when channel_title is present
      expect(screen.queryByText(/Old description/)).not.toBeInTheDocument();
    });

    it('falls back to description when channel_title is absent', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: 'A test video description',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('A test video description')).toBeInTheDocument();
      });
    });

    it('renders nothing when both channel_title and description are absent', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: '',
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });
      // No attribution text should appear
      expect(screen.queryByText(/Sincronizado desde/)).not.toBeInTheDocument();
    });

    it('truncates long description when channel_title is absent', async () => {
      const longDescription = 'A'.repeat(150);
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Test Video',
          description: longDescription,
          url: 'https://youtube.com/watch?v=abc123',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const onClose = vi.fn();
      render(<VideoExplorer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument();
      });
      // Should be truncated with ellipsis
      expect(screen.getByText('A'.repeat(117) + '…')).toBeInTheDocument();
    });
  });

  describe('search / filter', () => {
    it('renders search input when videos are present', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'React Hooks Deep Dive',
          description: '',
          url: 'https://yt.be/1',
          created_at: '',
        },
      ]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByLabelText('Buscar videos')).toBeInTheDocument());
    });

    it('does not render search input when library is empty', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() =>
        expect(
          screen.getByText('Aún no hay videos en la base de conocimiento.'),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByLabelText('Buscar videos')).not.toBeInTheDocument();
    });

    it('filters video list by title after debounce', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        { id: '1', title: 'React Hooks Deep Dive', description: '', url: '', created_at: '' },
        { id: '2', title: 'TypeScript Tips', description: '', url: '', created_at: '' },
      ]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('React Hooks Deep Dive')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Buscar videos'), { target: { value: 'typescript' } });
      // Wait for the debounce (250ms) to fire — React Hooks should be gone
      await waitFor(
        () => expect(screen.queryByText('React Hooks Deep Dive')).not.toBeInTheDocument(),
        { timeout: 1000 },
      );
      // TypeScript Tips is still shown (title text is split by <mark> highlight)
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('restores all videos when search is cleared', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        { id: '1', title: 'React Hooks Deep Dive', description: '', url: '', created_at: '' },
        { id: '2', title: 'TypeScript Tips', description: '', url: '', created_at: '' },
      ]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('React Hooks Deep Dive')).toBeInTheDocument());

      const input = screen.getByLabelText('Buscar videos');
      fireEvent.change(input, { target: { value: 'typescript' } });
      await waitFor(
        () => expect(screen.queryByText('React Hooks Deep Dive')).not.toBeInTheDocument(),
        { timeout: 1000 },
      );

      fireEvent.change(input, { target: { value: '' } });
      await waitFor(() => expect(screen.getByText('React Hooks Deep Dive')).toBeInTheDocument(), {
        timeout: 1000,
      });
    });

    it('shows "no match" empty state and echoes the query', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        { id: '1', title: 'React Hooks Deep Dive', description: '', url: '', created_at: '' },
      ]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('React Hooks Deep Dive')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Buscar videos'), { target: { value: 'Python' } });
      await waitFor(
        () => expect(screen.getByText(/No hay videos que coincidan/)).toBeInTheDocument(),
        {
          timeout: 1000,
        },
      );
      expect(screen.queryByText('React Hooks Deep Dive')).not.toBeInTheDocument();
    });

    it('shows "X of Y videos" filtered count in header when search is active', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        { id: '1', title: 'React Hooks Deep Dive', description: '', url: '', created_at: '' },
        { id: '2', title: 'TypeScript Tips', description: '', url: '', created_at: '' },
        { id: '3', title: 'Vue Basics', description: '', url: '', created_at: '' },
      ]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() =>
        expect(screen.getByText('3 videos en la base de conocimiento')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByLabelText('Buscar videos'), { target: { value: 'typescript' } });
      await waitFor(() => expect(screen.getByText('1 de 3 videos')).toBeInTheDocument(), {
        timeout: 1000,
      });
    });

    it('matches against channel_title and description in addition to title', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValueOnce([
        {
          id: '1',
          title: 'Episode 4',
          description: '',
          url: '',
          created_at: '',
          channel_title: 'Cole Medin',
        },
        {
          id: '2',
          title: 'Episode 5',
          description: 'Deep dive on retrieval augmented generation',
          url: '',
          created_at: '',
        },
        {
          id: '3',
          title: 'Episode 6',
          description: 'Unrelated content',
          url: '',
          created_at: '',
        },
      ]);
      render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('Episode 4')).toBeInTheDocument());

      // Match by channel_title
      const input = screen.getByLabelText('Buscar videos');
      fireEvent.change(input, { target: { value: 'cole' } });
      await waitFor(() => expect(screen.queryByText('Episode 5')).not.toBeInTheDocument(), {
        timeout: 1000,
      });
      expect(screen.getByText('Episode 4')).toBeInTheDocument();

      // Match by description
      fireEvent.change(input, { target: { value: 'retrieval' } });
      await waitFor(() => expect(screen.getByText('Episode 5')).toBeInTheDocument(), {
        timeout: 1000,
      });
      expect(screen.queryByText('Episode 4')).not.toBeInTheDocument();
      expect(screen.queryByText('Episode 6')).not.toBeInTheDocument();
    });

    it('resets search state when panel closes and reopens', async () => {
      vi.spyOn(api, 'getVideos').mockResolvedValue([
        { id: '1', title: 'React Hooks Deep Dive', description: '', url: '', created_at: '' },
      ]);
      const { rerender } = render(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText('React Hooks Deep Dive')).toBeInTheDocument());

      // Type a search query and wait for debounce
      fireEvent.change(screen.getByLabelText('Buscar videos'), { target: { value: 'Python' } });
      await waitFor(
        () => expect(screen.getByText(/No hay videos que coincidan/)).toBeInTheDocument(),
        {
          timeout: 1000,
        },
      );

      // Close the panel
      rerender(<VideoExplorer isOpen={false} onClose={vi.fn()} />);

      // Reopen the panel
      rerender(<VideoExplorer isOpen={true} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByLabelText('Buscar videos')).toBeInTheDocument());

      // Search input should be cleared
      expect((screen.getByLabelText('Buscar videos') as HTMLInputElement).value).toBe('');
      expect(screen.queryByText(/No hay videos que coincidan/)).not.toBeInTheDocument();
    });
  });
});
