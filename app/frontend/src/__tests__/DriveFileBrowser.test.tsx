import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DriveFileBrowser } from '../components/drive/DriveFileBrowser';
import type { DriveFile } from '../lib/api';

const file: DriveFile = {
  id: 'file-1',
  name: 'evolucion-2026-09-16.md',
  version: '27',
  mimeType: 'text/markdown',
  modifiedTime: '2026-09-16T14:30:00Z',
};

interface BrowserOverrides {
  patientId?: string | null;
  query?: string;
  files?: DriveFile[];
  listLoading?: boolean;
  searchLoading?: boolean;
  searchSubmitted?: boolean;
  importing?: boolean;
  imported?: boolean;
  nextPageToken?: string | null;
}

const onOpen = vi.fn();

function renderBrowser(overrides: BrowserOverrides = {}) {
  const props = {
    patientId: 'patient-1',
    query: 'evolucion',
    files: [file],
    listLoading: false,
    searchLoading: false,
    searchSubmitted: true,
    importing: false,
    imported: false,
    nextPageToken: null,
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    onClearSearch: vi.fn(),
    onImport: vi.fn(),
    onOpen,
    onLoadMore: vi.fn(),
    ...overrides,
  };
  return { ...render(<DriveFileBrowser {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

describe('DriveFileBrowser', () => {
  it('renders a rich row with separate open and details actions', () => {
    renderBrowser();

    expect(screen.getByText(file.name)).toBeInTheDocument();
    const row = screen.getByRole('button', { name: `Abrir ${file.name}` }).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Markdown')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('16 sept 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Abrir ${file.name}` })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Ver detalles de ${file.name}` }),
    ).toBeInTheDocument();
  });

  it('opens the document from the primary action', () => {
    renderBrowser();

    fireEvent.click(screen.getByRole('button', { name: `Abrir ${file.name}` }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(file);
  });

  it('shows local details without opening the document or exposing technical metadata', () => {
    renderBrowser();

    fireEvent.click(screen.getByRole('button', { name: `Ver detalles de ${file.name}` }));

    const details = screen.getByText('Detalles del documento').closest('section');
    expect(details).not.toBeNull();
    expect(
      within(details as HTMLElement).getByText('Administrado por Dental AI Assistant'),
    ).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText('Tipo')).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText('Markdown')).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText('Última modificación')).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText('Documentos del paciente')).toBeInTheDocument();
    expect(screen.queryByText(file.id)).not.toBeInTheDocument();
    expect(screen.queryByText(/version 27/i)).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the selected file from details', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: `Ver detalles de ${file.name}` }));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir documento' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(file);
  });

  it('returns to the preserved browser state and restores focus', async () => {
    renderBrowser({ nextPageToken: 'next-page' });
    const detailsButton = screen.getByRole('button', {
      name: `Ver detalles de ${file.name}`,
    });
    fireEvent.click(detailsButton);

    fireEvent.click(screen.getByRole('button', { name: 'Volver a documentos' }));

    expect(screen.getByRole('searchbox', { name: 'Buscar documentos' })).toHaveValue('evolucion');
    expect(screen.getByRole('button', { name: `Abrir ${file.name}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar copia desde Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    await waitFor(() => expect(detailsButton).toHaveFocus());
  });

  it('closes stale details when the active patient changes', () => {
    const view = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: `Ver detalles de ${file.name}` }));
    expect(screen.getByText('Detalles del documento')).toBeInTheDocument();

    view.rerender(<DriveFileBrowser {...view.props} patientId="patient-2" />);

    expect(screen.queryByText('Detalles del documento')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Abrir ${file.name}` })).toBeInTheDocument();
  });

  it('preserves loading, empty, importing, imported, and pagination feedback', () => {
    const loading = renderBrowser({ files: [], listLoading: true, query: '' });
    expect(screen.getByText('Cargando documentos…')).toBeInTheDocument();
    loading.unmount();

    const empty = renderBrowser({ files: [], query: '', searchSubmitted: false });
    expect(screen.getByText('Aún no hay documentos')).toBeInTheDocument();
    empty.unmount();

    const noMatch = renderBrowser({ files: [], query: 'ausente', searchSubmitted: true });
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
    noMatch.unmount();

    const importing = renderBrowser({ importing: true });
    expect(screen.getByRole('button', { name: 'Importando…' })).toBeDisabled();
    importing.unmount();

    const imported = renderBrowser({ imported: true, nextPageToken: 'next-page' });
    expect(screen.getByRole('status')).toHaveTextContent('Documento importado');
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
  });

  it('switches between grid and list views and persists the preference', () => {
    const files = [
      file,
      { ...file, id: 'file-2', name: 'indicaciones.txt', modifiedTime: '2026-09-15T12:00:00Z' },
      { ...file, id: 'file-3', name: 'plan.pdf', modifiedTime: '2026-09-14T12:00:00Z' },
    ];
    const view = renderBrowser({ files, query: '', searchSubmitted: false });

    expect(screen.getByRole('button', { name: 'Vista en lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vista en cuadrícula' }));
    expect(screen.getByRole('button', { name: 'Vista en cuadrícula' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Acceso rápido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir plan.pdf' })).toBeInTheDocument();

    view.unmount();
    renderBrowser({ files, query: '', searchSubmitted: false });
    expect(screen.getByRole('button', { name: 'Vista en cuadrícula' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hides Quick Access while searching', () => {
    const files = [
      file,
      { ...file, id: 'file-2', name: 'indicaciones.txt' },
      { ...file, id: 'file-3', name: 'plan.pdf' },
    ];
    renderBrowser({ files, query: 'plan', searchSubmitted: true });

    expect(screen.queryByRole('region', { name: 'Acceso rápido' })).not.toBeInTheDocument();
  });
});
