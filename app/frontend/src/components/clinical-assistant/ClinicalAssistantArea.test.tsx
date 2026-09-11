import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPatients } from '../../lib/api';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

const send = vi.fn();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, getPatients: vi.fn().mockResolvedValue([]) };
});

vi.mock('../../hooks/useClinicalAssistant', () => ({
  useClinicalAssistant: () => ({
    thread: null,
    items: [],
    runtime: 'streaming',
    error: null,
    send,
    stop: vi.fn(),
    setActivePatient: vi.fn(),
    updateDraft: vi.fn(),
    updateDraftSource: vi.fn(),
    updateDraftDate: vi.fn(),
    regenerateDraft: vi.fn(),
    prepareDraft: vi.fn(),
    resolve: vi.fn(),
    backToEdit: vi.fn(),
    patientSwitch: null,
    cancelPatientSwitch: vi.fn(),
    confirmPatientSwitch: vi.fn(),
    retryTurn: vi.fn(),
    artifactSyncState: {},
    retryArtifactSync: vi.fn(),
  }),
}));

describe('ClinicalAssistantArea queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPatients).mockResolvedValue([]);
  });

  it('keeps the fourth draft when three messages are already queued', () => {
    render(<ClinicalAssistantArea threadId="thread-1" />);
    const composer = screen.getByRole('textbox', { name: 'Nota clínica' });
    const submit = screen.getByRole('button', { name: 'Poner mensaje en cola' });

    for (const message of ['Uno', 'Dos', 'Tres']) {
      fireEvent.change(composer, { target: { value: message } });
      fireEvent.click(submit);
    }
    fireEvent.change(composer, { target: { value: 'Cuatro' } });
    fireEvent.click(submit);

    expect(composer).toHaveValue('Cuatro');
    expect(screen.getByRole('alert')).toHaveTextContent('Ya tienes 3 mensajes pendientes.');
    expect(screen.getByText('3 mensajes en cola')).toBeVisible();
  });
});
