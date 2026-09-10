import { type Locator, type Page, expect, test } from '@playwright/test';

const threadId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const actionId = '33333333-3333-4333-8333-333333333333';
const secondActionId = '33333333-3333-4333-8333-333333333334';
const evolutionId = '44444444-4444-4444-8444-444444444444';
type MockAction = Record<string, unknown>;
type MockArtifact = Record<string, unknown>;
type MockMessage = Record<string, unknown>;

const patient = {
  id: patientId,
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
  birth_date: '1990-01-01',
};

const draft = {
  context: 'Control preventivo',
  findings: 'Encías sin sangrado al sondaje.',
  assessment: 'Salud periodontal estable.',
  treatment: 'Mantener higiene y controles.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

function thread(actions: MockAction[] = []) {
  return {
    id: threadId,
    owner_user_id: '55555555-5555-4555-8555-555555555555',
    title: 'Ana Pérez · Control',
    active_patient: patient,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    messages: [] as MockMessage[],
    artifacts: [] as MockArtifact[],
    pending_action: null as MockAction | null,
    actions,
  };
}

function sseEvent(
  name: string,
  sequence: number,
  turnId: string,
  itemId: string,
  itemType: string,
  data: Record<string, unknown>,
  status: string | null = null,
) {
  return `event: ${name}\ndata: ${JSON.stringify({
    schema_version: 1,
    event_id: `${itemId}:event`,
    sequence,
    thread_id: threadId,
    turn_id: turnId,
    item_id: itemId,
    item_type: itemType,
    status,
    data,
  })}\n\n`;
}

async function settleClinicalItem(page: Page, item: Locator): Promise<void> {
  await page.locator('.clinical-transcript').evaluate((element) => {
    const transcript = element as HTMLDivElement;
    transcript.scrollTop = transcript.scrollHeight;
  });
  await expect
    .poll(() =>
      item.evaluate((element) => {
        const composer = document.querySelector('.clinical-composer');
        if (!composer) return false;
        const anchor = element.querySelector('button:last-of-type') ?? element;
        return anchor.getBoundingClientRect().bottom <= composer.getBoundingClientRect().top;
      }),
    )
    .toBe(true);
}

test('clinical assistant preserves the complete two-turn review flow', async ({ page }) => {
  let turnCount = 0;
  let actionCount = 0;
  let threadState = thread();

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '55555555-5555-4555-8555-555555555555',
        email: 'demo@example.com',
        is_admin: false,
        messages_used_today: 0,
        messages_remaining_today: 25,
        rate_window_resets_at: null,
      }),
    }),
  );
  await page.route('**/api/patients', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([patient]),
    }),
  );
  await page.route('**/api/clinical-threads', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ...threadState,
            preview: null,
            active_patient_id: patientId,
            approval_pending: Boolean(threadState.pending_action),
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(threadState),
    });
  });
  await page.route(`**/api/clinical-threads/${threadId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(threadState),
    }),
  );
  await page.route(`**/api/clinical-threads/${threadId}/turns`, async (route) => {
    const body = route.request().postDataJSON() as { turn_id: string; content: string };
    turnCount += 1;
    const draftId = `draft-${turnCount}`;
    const assistantId = `assistant-${turnCount}`;
    const artifact = {
      id: draftId,
      owner_user_id: '55555555-5555-4555-8555-555555555555',
      thread_id: threadId,
      turn_id: body.turn_id,
      patient_id: patientId,
      artifact_type: 'clinical_draft',
      status: 'draft',
      source_note: body.content,
      generated_draft: draft,
      draft,
      evolution_at: '2026-01-15T12:01:00-03:00',
      created_at: '2026-01-15T12:01:00Z',
      updated_at: '2026-01-15T12:01:00Z',
      resolved_at: null,
    };
    threadState = {
      ...threadState,
      messages: [
        ...threadState.messages,
        {
          id: `user-${turnCount}`,
          turn_id: body.turn_id,
          role: 'user',
          content: body.content,
          created_at: '2026-01-15T12:00:58Z',
        },
        {
          id: assistantId,
          turn_id: body.turn_id,
          role: 'assistant',
          content: 'Preparé un borrador para tu revisión.',
          created_at: '2026-01-15T12:01:01Z',
        },
      ],
      artifacts: [...threadState.artifacts, artifact],
    };
    const payload = [
      sseEvent(
        'turn.started',
        1,
        body.turn_id,
        `turn-${turnCount}`,
        'turn',
        { user_content: body.content },
        'running',
      ),
      sseEvent(
        'item.started',
        2,
        body.turn_id,
        draftId,
        'activity',
        { label: 'Preparando borrador', created_at: '2026-01-15T12:00:59Z' },
        'running',
      ),
      sseEvent(
        'item.completed',
        3,
        body.turn_id,
        draftId,
        'clinical_draft',
        {
          draft,
          source_note: body.content,
          patient_id: patientId,
          evolution_at: '2026-01-15T12:01:00-03:00',
          created_at: '2026-01-15T12:01:00Z',
        },
        'completed',
      ),
      sseEvent(
        'item.completed',
        4,
        body.turn_id,
        assistantId,
        'assistant_message',
        { content: 'Preparé un borrador para tu revisión.', created_at: '2026-01-15T12:01:01Z' },
        'completed',
      ),
      sseEvent('turn.completed', 5, body.turn_id, `complete-${turnCount}`, 'turn', {}, 'completed'),
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: payload });
  });
  await page.route(`**/api/clinical-threads/${threadId}/drafts`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(draft) }),
  );
  await page.route(`**/api/clinical-threads/${threadId}/artifacts/*`, async (route) => {
    const body = route.request().postDataJSON() as {
      source_note: string;
      draft: typeof draft;
      evolution_at: string;
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: route.request().url().split('/').pop(),
        owner_user_id: '55555555-5555-4555-8555-555555555555',
        thread_id: threadId,
        turn_id: 'turn-1',
        patient_id: patientId,
        artifact_type: 'clinical_draft',
        status: body.source_note === 'Nota fuente corregida.' ? 'stale' : 'draft',
        source_note: body.source_note,
        generated_draft: draft,
        draft: body.draft,
        evolution_at: body.evolution_at,
        created_at: '2026-01-15T12:01:00Z',
        updated_at: '2026-01-15T12:02:00Z',
        resolved_at: null,
      }),
    });
  });
  await page.route(`**/api/clinical-threads/${threadId}/prepare-save`, async (route) => {
    const body = route.request().postDataJSON() as { turn_id: string; artifact_id: string };
    actionCount += 1;
    const nextActionId = actionCount === 1 ? actionId : secondActionId;
    const action = {
      id: nextActionId,
      thread_id: threadId,
      turn_id: body.turn_id,
      artifact_id: body.artifact_id,
      patient_id: patientId,
      action_type: 'save_evolution',
      proposal_payload: {
        evolution_id: evolutionId,
        patient_id: patientId,
        evolution_at: '2026-01-15T12:00:00Z',
        raw_note: 'Nota clínica',
        generated_text: 'Generado',
        final_text: draft.findings,
      },
      proposal_hash: 'a'.repeat(64),
      status: 'pending',
      expires_at: '2026-01-15T12:30:00Z',
      created_at: '2026-01-15T12:02:00Z',
      resolved_at: null,
      result_resource_id: null,
      patient,
    };
    threadState = {
      ...threadState,
      actions: [...threadState.actions, action],
      pending_action: action,
      pending_action_patient: patient,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(action),
    });
  });
  await page.route('**/api/clinical-actions/*/resolve', async (route) => {
    const decision = (route.request().postDataJSON() as { decision: string }).decision;
    const resolvedId = route.request().url().split('/').slice(-2, -1)[0];
    const current =
      threadState.actions.find((candidate) => candidate.id === resolvedId) ??
      threadState.actions[0];
    const resolved = {
      ...current,
      status: decision === 'decline' ? 'declined' : 'approved',
      result_resource_id: evolutionId,
      resolved_at: '2026-01-15T12:03:00Z',
    };
    threadState = {
      ...threadState,
      actions: threadState.actions.map((candidate) =>
        candidate.id === resolvedId ? resolved : candidate,
      ),
      pending_action: null,
      pending_action_patient: null,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resolved),
    });
  });

  const initialThreadLoad = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/clinical-threads/${threadId}`) &&
      response.request().method() === 'GET',
  );
  await page.goto(`/a/${threadId}`);
  await initialThreadLoad;
  await expect(
    page.getByRole('heading', { name: 'Trabaja más rápido con tus evoluciones' }),
  ).toBeVisible();
  await expect(page.locator('main.chat-area')).toBeVisible();
  await expect(page.locator('.chat-message-scroll')).toBeVisible();
  await expect(page.getByTestId('clinical-composer')).toHaveClass(/chat-composer/);
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();

  const sidebar = page.locator('#app-sidebar');
  await sidebar.getByRole('button', { name: 'Colapsar navegación' }).click();
  await expect(sidebar).toHaveClass(/collapsed/);
  await expect
    .poll(() => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width)))
    .toBe(56);
  await expect
    .poll(() => sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  await expect(sidebar.locator('.workspace-thread-list')).toHaveClass(/is-collapsed/);
  await expect(sidebar.locator('.workspace-thread-list')).toHaveCSS('overflow-y', 'visible');
  await expect(sidebar.locator('.sidebar-secondary-scroll')).toHaveCSS('overflow-y', 'auto');
  await expect(sidebar.locator('.workspace-thread-list__heading')).toHaveCount(0);
  await expect(sidebar.locator('.workspace-thread-list__group-heading')).toHaveCount(0);
  await expect(sidebar.locator('.workspace-thread-list__item')).toHaveCount(0);
  const historyButton = sidebar.getByRole('button', {
    name: 'Abrir historial de asistente',
  });
  await expect(historyButton).toBeVisible();
  await expect(sidebar).toHaveScreenshot('clinical-sidebar-collapsed.png', {
    animations: 'disabled',
    maxDiffPixels: 100,
  });
  await historyButton.click();
  await expect(
    sidebar.getByRole('button', { name: 'Ana Pérez · Control', exact: true }),
  ).toBeVisible();

  await expect(page).toHaveScreenshot('clinical-empty.png', {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixels: 300,
  });

  const composer = page.getByTestId('clinical-composer').getByLabel('Nota clínica');
  await composer.fill('Control preventivo sin hallazgos nuevos.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByRole('heading', { name: 'Evolución propuesta' })).toBeVisible();
  await expect(page.getByText('Preparé un borrador para tu revisión.')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Tú' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Asistente' })).toBeVisible();
  await settleClinicalItem(page, page.getByRole('article', { name: 'Evolución propuesta' }));
  await expect(page).toHaveScreenshot('clinical-draft.png', {
    animations: 'disabled',
    maxDiffPixels: 300,
  });

  await page.getByRole('button', { name: 'Ver nota clínica original' }).click();
  await page.getByRole('button', { name: 'Editar nota original' }).click();
  await page.getByLabel('Editar nota clínica original').fill('Nota fuente corregida.');
  await expect(page.getByText('Requiere regenerar')).toBeVisible();
  await settleClinicalItem(page, page.getByRole('article', { name: 'Evolución propuesta' }));
  await expect(page).toHaveScreenshot('clinical-editing.png', {
    animations: 'disabled',
    maxDiffPixels: 300,
  });
  await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
  await expect(page.getByText('Borrador IA')).toBeVisible();
  await expect(page.getByText('Preparé un borrador para tu revisión.')).toHaveCount(1);

  await page.getByRole('button', { name: 'Guardar evolución' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirmar guardado' });
  await expect(confirmation).toBeVisible();
  await expect(page).toHaveScreenshot('clinical-approval-pending.png', {
    animations: 'disabled',
    maxDiffPixels: 300,
  });
  await confirmation.getByRole('button', { name: 'Guardar evolución' }).click();
  await expect(page.getByText('Evolución guardada', { exact: true })).toBeVisible();
  await settleClinicalItem(page, page.getByText('Evolución guardada', { exact: true }));
  await expect(page).toHaveScreenshot('clinical-approval-resolved.png', {
    animations: 'disabled',
    maxDiffPixels: 300,
  });

  await composer.fill('Segundo control independiente.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.locator('[aria-label="Evolución propuesta"]')).toHaveCount(2);
  await expect(page.getByText('Preparé un borrador para tu revisión.')).toHaveCount(2);
  await settleClinicalItem(page, page.locator('[aria-label="Evolución propuesta"]').last());
  await expect(page).toHaveScreenshot('clinical-second-turn.png', {
    animations: 'disabled',
    maxDiffPixels: 300,
  });
  await page.getByRole('button', { name: 'Guardar evolución' }).last().click();
  await expect(page.getByRole('dialog', { name: 'Confirmar guardado' })).toBeVisible();
  await expect(page).toHaveScreenshot('clinical-second-approval.png', {
    animations: 'disabled',
    maxDiffPixels: 300,
  });

  await page.goto('/chat');
  await expect(page.getByLabel('Pregunta sobre la biblioteca de videos')).toBeVisible();
  await page.goto(`/a/${threadId}`);
  await expect(page.locator('[aria-label="Evolución propuesta"]')).toHaveCount(2);
  await expect(page.getByText('Evolución guardada', { exact: true })).toBeVisible();
  await expect(page.getByText('Guardado pendiente')).toBeVisible();

  await page.reload();
  await expect(page.locator('[aria-label="Evolución propuesta"]')).toHaveCount(2);
  await expect(page.getByText('Evolución guardada', { exact: true })).toBeVisible();
  await expect(page.getByText('Guardado pendiente')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await settleClinicalItem(page, page.getByText('Guardado pendiente'));
  await expect(page).toHaveScreenshot('clinical-mobile.png', {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixels: 300,
  });
});

test('locks clinical patient scope while handing off dictation', async ({ page }) => {
  await page.addInitScript(() => {
    class DeterministicMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      state: RecordingState = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({
          data: new Blob(['deterministic voice'], { type: 'audio/webm' }),
        } as BlobEvent);
        this.onstop?.();
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: DeterministicMediaRecorder,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }),
      },
    });
  });
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '55555555-5555-4555-8555-555555555555',
        email: 'demo@example.com',
        is_admin: false,
        messages_used_today: 0,
        messages_remaining_today: 25,
        rate_window_resets_at: null,
      }),
    }),
  );
  await page.route('**/api/patients', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([patient]),
    }),
  );
  await page.route('**/api/clinical-threads', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ ...thread(), preview: null, active_patient_id: patientId }]),
    }),
  );
  await page.route(`**/api/clinical-threads/${threadId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(thread()),
    }),
  );
  let releaseTranscription!: () => void;
  const transcriptionReady = new Promise<void>((resolve) => {
    releaseTranscription = resolve;
  });
  await page.route('**/api/transcriptions', async (route) => {
    await transcriptionReady;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'Texto dictado.' }),
    });
  });

  await page.goto(`/a/${threadId}`);
  const input = page.getByLabel('Nota clínica');
  await expect(input).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar dictado' }).click();
  await expect(page.getByRole('button', { name: 'Terminar dictado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar paciente activo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Quitar paciente activo' })).toBeDisabled();
  await page.getByRole('button', { name: 'Terminar dictado' }).click();

  await expect(input).toBeEditable();
  await expect(page.getByText('Transcribiendo dictado… Puedes seguir editando.')).toBeVisible();
  await input.fill('Nota manual');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  releaseTranscription();
  await expect(input).toHaveValue('Nota manual\nTexto dictado.');
  await expect(page.getByText('Dictado añadido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar paciente activo' })).toBeEnabled();
});
