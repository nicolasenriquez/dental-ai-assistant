// Task 2.1 fail-first suite for F04 (unapplied artifact edits survive internal
// navigation). Red until task 2.2 moves field/source buffers into authenticated
// clinical memory: navigation retention, pending/failed sync hydration, newer
// hydration and the unload guard.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalDraft, ClinicalThread, ClinicalTurnArtifact } from '../../lib/api';
import * as api from '../../lib/api';
import { ClinicalRuntimeProvider, useOptionalClinicalRuntime } from '../ClinicalRuntimeProvider';
import { EvolutionReviewArtifact } from '../clinical/EvolutionReviewArtifact';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getClinicalThread: vi.fn(),
    getPatients: vi.fn(),
    updateClinicalArtifact: vi.fn(),
    prepareClinicalSave: vi.fn(),
    resolveClinicalAction: vi.fn(),
    cancelClinicalTurn: vi.fn(),
  };
});

const DRAFT: ClinicalDraft = {
  context: 'Control preventivo.',
  findings: 'Sin hallazgos nuevos.',
  assessment: 'Salud periodontal estable.',
  treatment: 'Mantener higiene.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

const PATIENT = {
  id: 'p1',
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '••••',
};

function artifact(overrides: Partial<ClinicalTurnArtifact> = {}): ClinicalTurnArtifact {
  return {
    id: 'artifact-1',
    owner_user_id: 'owner',
    thread_id: 'a',
    turn_id: 'turn-1',
    patient_id: 'p1',
    artifact_type: 'clinical_draft',
    status: 'draft',
    source_note: 'Nota clínica original',
    generated_draft: DRAFT,
    draft: DRAFT,
    evolution_at: '2026-09-10T12:00:00Z',
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    ...overrides,
  };
}

function threadWithArtifact(overrides: Partial<ClinicalTurnArtifact> = {}): ClinicalThread {
  return {
    id: 'a',
    owner_user_id: 'owner',
    title: 'Hilo A',
    active_patient: PATIENT,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-09-10T12:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    messages: [],
    artifacts: [artifact(overrides)],
    pending_action: null,
    actions: [],
  };
}

function AreaRoute(): JSX.Element | null {
  const { threadId } = useParams<{ threadId: string }>();
  const shared = useOptionalClinicalRuntime();
  if (!threadId || !shared) return null;
  return <ClinicalAssistantArea threadId={threadId} assistant={shared.controller} />;
}

function ReloadProbe(): JSX.Element {
  const shared = useOptionalClinicalRuntime();
  return (
    <button type="button" onClick={() => void shared?.controller.reload()}>
      Recargar hilo de prueba
    </button>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/a/a']}>
      <ClinicalRuntimeProvider>
        <nav>
          <Link to="/pending">Salir a pendientes</Link>
          <Link to="/a/a">Volver al hilo</Link>
          <Link to="/a/b">Ir al hilo B</Link>
        </nav>
        <Routes>
          <Route path="/a/:threadId" element={<AreaRoute />} />
          <Route path="/pending" element={<p>Pendientes</p>} />
          <Route path="/b" element={<p>Hilo B</p>} />
        </Routes>
        <ReloadProbe />
      </ClinicalRuntimeProvider>
    </MemoryRouter>,
  );
}

async function openFieldEditor(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Hallazgos' }));
  return screen.getByRole('textbox', { name: 'Hallazgos' });
}

function navigateAwayAndBack(): void {
  fireEvent.click(screen.getByRole('link', { name: 'Salir a pendientes' }));
  fireEvent.click(screen.getByRole('link', { name: 'Volver al hilo' }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(api.getPatients).mockResolvedValue([]);
  vi.mocked(api.getClinicalThread).mockResolvedValue(threadWithArtifact());
  vi.mocked(api.updateClinicalArtifact).mockResolvedValue(artifact());
});

describe('assistant artifact edit buffers', () => {
  it('keeps an unapplied field buffer and its editor across internal navigation', async () => {
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'TEXTO SIN APLICAR' } });

    navigateAwayAndBack();

    const restored = await screen.findByRole('textbox', { name: 'Hallazgos' });
    expect(restored).toHaveValue('TEXTO SIN APLICAR');
    expect(restored).toHaveFocus();
  });

  it('keeps an unapplied source-note buffer and its editor across internal navigation', async () => {
    renderHarness();
    await screen.findByRole('button', { name: 'Editar Hallazgos' });
    fireEvent.click(screen.getByRole('button', { name: 'Ver evidencia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar nota original' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar nota clínica original' }), {
      target: { value: 'NOTA FUENTE SIN APLICAR' },
    });

    navigateAwayAndBack();

    expect(
      await screen.findByRole('textbox', { name: 'Editar nota clínica original' }),
    ).toHaveValue('NOTA FUENTE SIN APLICAR');
  });

  it('keeps an applied edit that is still syncing when a stale read returns', async () => {
    vi.mocked(api.updateClinicalArtifact).mockImplementation(() => new Promise<never>(() => {}));
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'EDICIÓN APLICADA PENDIENTE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(api.updateClinicalArtifact).toHaveBeenCalledTimes(1));

    // The canonical read still shows the previous draft until the update commits.
    vi.mocked(api.getClinicalThread).mockResolvedValue(threadWithArtifact());
    fireEvent.click(screen.getByRole('button', { name: 'Recargar hilo de prueba' }));
    await waitFor(() => expect(api.getClinicalThread).toHaveBeenCalledTimes(2));

    expect(await screen.findByText('EDICIÓN APLICADA PENDIENTE')).toBeVisible();
  });

  it('keeps a failed edit locally and still refuses to overwrite it on reload', async () => {
    vi.mocked(api.updateClinicalArtifact).mockRejectedValue(new Error('network'));
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'EDICIÓN FALLIDA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(
      await screen.findByText('No pudimos guardar estos cambios. Tu contenido sigue aquí.'),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Recargar hilo de prueba' }));
    await waitFor(() => expect(api.getClinicalThread).toHaveBeenCalledTimes(2));

    expect(await screen.findByText('EDICIÓN FALLIDA')).toBeVisible();
  });

  it('keeps unapplied local text when a newer canonical draft arrives during internal navigation', async () => {
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'TEXTO LOCAL PENDIENTE' } });

    navigateAwayAndBack();
    vi.mocked(api.getClinicalThread).mockResolvedValue(
      threadWithArtifact({
        draft: { ...DRAFT, findings: 'HALLAZGOS DEL SERVIDOR' },
        generated_draft: { ...DRAFT, findings: 'HALLAZGOS DEL SERVIDOR' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recargar hilo de prueba' }));
    await waitFor(() => expect(api.getClinicalThread).toHaveBeenCalledTimes(2));

    expect(await screen.findByRole('textbox', { name: 'Hallazgos' })).toHaveValue(
      'TEXTO LOCAL PENDIENTE',
    );
  });

  it('protects unload while a field buffer is unapplied', async () => {
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'BORRADOR DE CAMPO' } });

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('cancels only the selected edit and leaves no unload protection behind', async () => {
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'DESCARTAR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.updateClinicalArtifact).not.toHaveBeenCalled();
    expect(screen.getByText(DRAFT.findings)).toBeVisible();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('clears an applied buffer once its sync reports success', async () => {
    renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'EDICIÓN GUARDADA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(api.updateClinicalArtifact).toHaveBeenCalledTimes(1));
    await screen.findByText('Cambios guardados');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not restore buffers after logout and never writes browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const view = renderHarness();
    const textarea = await openFieldEditor();
    fireEvent.change(textarea, { target: { value: 'NO DEBE PERSISTIR' } });

    view.unmount();
    renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Hallazgos' }));

    expect(screen.getByRole('textbox', { name: 'Hallazgos' })).toHaveValue(DRAFT.findings);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps the shared manual review workflow explicit', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <ClinicalRuntimeProvider>
          <EvolutionReviewArtifact
            mode="manual"
            sourceNote="Nota original"
            draft={DRAFT}
            generatedDraft={DRAFT}
            evolutionAt="2026-09-10T12:00:00Z"
            stale={false}
            edited={false}
            onChange={onChange}
            onPrepare={vi.fn()}
          />
        </ClinicalRuntimeProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar Hallazgos' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Hallazgos' }), {
      target: { value: 'TEXTO MANUAL' },
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(DRAFT.findings)).toBeVisible();
  });
});
