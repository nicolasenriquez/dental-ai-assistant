import { type Locator, type Page, type Route, expect, test } from '@playwright/test';

const patientId = 'fc583c6a-8f9e-4579-9169-cc9335644c12';
const evolutionId = 'be3e2c0e-3158-48e9-b91f-7801e7d7b1e4';
const threadId = '22222222-2222-4222-8222-222222222222';
const conversationId = '00000000-0000-0000-0000-000000000002';
const videoId = '00000000-0000-0000-0000-000000000003';

const patient = {
  id: patientId,
  first_name: 'Ana',
  last_name: 'Pérez',
  rut_masked: '12.345.•••-6',
  birth_date: '1990-01-01',
  last_evolution_at: '2026-09-08T17:22:00Z',
};

const evolution = {
  id: evolutionId,
  patient_id: patientId,
  evolution_at: '2026-09-08T12:00:00Z',
  final_text: 'Motivo / contexto: Control preventivo.\n\nHallazgos: Sin hallazgos nuevos.',
  created_at: '2026-09-08T12:00:00Z',
};

const evolutionSummary = {
  ...evolution,
  preview: 'Motivo / contexto: Control preventivo. Hallazgos: Sin hallazgos nuevos.',
};

const draft = {
  context: 'Control preventivo.',
  findings: 'Sin hallazgos nuevos.',
  assessment: 'Salud oral estable.',
  treatment: 'Mantener higiene y controles.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

const video = {
  id: videoId,
  title: 'Building Production RAG Pipelines',
  url: 'https://www.youtube.com/watch?v=ProdRagPip1',
  created_at: '2026-01-15T12:00:00Z',
  chunk_count: 3,
};

const conversation = {
  id: conversationId,
  title: 'Conversación QA',
  created_at: '2026-01-15T12:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
  preview: 'Respuesta hidratada de QA',
  messages: [
    {
      id: '00000000-0000-0000-0000-000000000006',
      conversation_id: conversationId,
      role: 'assistant',
      content: 'Respuesta hidratada de QA.',
      created_at: '2026-01-15T12:00:00Z',
      sources: [],
    },
  ],
};

const clinicalThread = {
  id: threadId,
  owner_user_id: '55555555-5555-4555-8555-555555555555',
  title: 'Ana Pérez · Control',
  active_patient: patient,
  pending_action_patient: null,
  active_turn_id: null,
  created_at: '2026-01-15T12:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
  messages: [],
  artifacts: [],
  pending_action: null,
  actions: [],
};

const user = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'qa@example.com',
  is_admin: true,
  messages_used_today: 1,
  messages_remaining_today: 24,
  rate_window_resets_at: null,
};

interface QaRouteOptions {
  authenticated?: boolean;
  admin?: boolean;
  driveEnabled?: boolean;
  conversationLoadFailures?: number;
  streamFailuresBeforeSuccess?: number;
  holdFirstStream?: boolean;
  holdClinicalStream?: boolean;
}

interface QaRouteControls {
  releaseHeldStream: () => void;
  clinicalStreamEntered: Promise<void>;
}

interface QaRuntimeDiagnostics {
  errors: string[];
  unexpectedApiRequests: string[];
  expectedResourceFailures: number[];
  expectedConsoleErrors: string[];
}

const qaRuntimeDiagnostics = new WeakMap<Page, QaRuntimeDiagnostics>();

function allowExpectedResourceFailure(page: Page, status: number): void {
  qaRuntimeDiagnostics.get(page)?.expectedResourceFailures.push(status);
}

function allowExpectedConsoleError(page: Page, fragment: string): void {
  qaRuntimeDiagnostics.get(page)?.expectedConsoleErrors.push(fragment);
}

function json(body: unknown, status = 200): Parameters<Route['fulfill']>[0] {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function clinicalEvent(
  name: string,
  sequence: number,
  itemId: string,
  itemType: string,
  data: Record<string, unknown>,
  turnId = 'turn-qa',
  status: string | null = 'completed',
): string {
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

async function installQaRoutes(page: Page, options: QaRouteOptions = {}): Promise<QaRouteControls> {
  let authenticated = options.authenticated ?? true;
  const admin = options.admin ?? true;
  let loginAttempts = 0;
  let conversationLoadAttempts = 0;
  let streamAttempts = 0;
  let releaseHeldStream: (() => void) | null = null;
  let resolveClinicalStreamEntered: (() => void) | null = null;
  const clinicalStreamEntered = new Promise<void>((resolve) => {
    resolveClinicalStreamEntered = resolve;
  });
  let currentClinicalThread: Record<string, unknown> = {
    ...clinicalThread,
    messages: [],
    artifacts: [],
    actions: [],
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/auth/config') {
      await route.fulfill(
        json({
          mode: 'local',
          google_client_id: null,
          drive_enabled: options.driveEnabled ?? false,
          drive_auto_onboard: false,
        }),
      );
      return;
    }
    if (path === '/api/auth/me') {
      if (!authenticated) allowExpectedResourceFailure(page, 401);
      await route.fulfill(
        authenticated ? json({ ...user, is_admin: admin }) : json({ detail: 'Unauthorized' }, 401),
      );
      return;
    }
    if (path === '/api/auth/login' && method === 'POST') {
      loginAttempts += 1;
      if (loginAttempts === 1) {
        allowExpectedResourceFailure(page, 401);
        await route.fulfill(json({ detail: 'Credenciales inválidas' }, 401));
      } else {
        authenticated = true;
        await route.fulfill(json({ id: user.id, email: user.email }));
      }
      return;
    }
    if (path === '/api/auth/signup' && method === 'POST') {
      await route.fulfill(json({ id: user.id, email: user.email }, 201));
      return;
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      authenticated = false;
      await route.fulfill({ status: 204 });
      return;
    }

    if (path === '/api/google-drive/status') {
      await route.fulfill(
        json({
          configured: true,
          status: options.driveEnabled ? 'connected' : 'disconnected',
          workspace: { folder_name: 'Dental AI Assistant' },
        }),
      );
      return;
    }

    if (path === '/api/patients/search' && method === 'POST') {
      const body = request.postDataJSON() as { query?: string };
      await route.fulfill(
        json((body.query ?? '').toLowerCase().includes('sin resultado') ? [] : [patient]),
      );
      return;
    }
    if (path === '/api/patients' && method === 'GET') {
      await route.fulfill(json([patient]));
      return;
    }
    if (path === '/api/patients' && method === 'POST') {
      await route.fulfill(json({ ...patient, id: patientId }, 201));
      return;
    }
    if (path === `/api/patients/${patientId}` && method === 'GET') {
      await route.fulfill(json(patient));
      return;
    }
    if (path === `/api/patients/${patientId}` && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill(json({ ...patient, ...body }));
      return;
    }
    if (path === `/api/patients/${patientId}/evolutions` && method === 'GET') {
      await route.fulfill(json([evolutionSummary]));
      return;
    }
    if (path === `/api/patients/${patientId}/evolutions` && method === 'POST') {
      await route.fulfill(json({ ...evolution, id: evolutionId }, 201));
      return;
    }
    if (path === `/api/evolutions/${evolutionId}` && method === 'GET') {
      await route.fulfill(json(evolution));
      return;
    }
    if (path === '/api/evolutions/generate' && method === 'POST') {
      await route.fulfill(json(draft));
      return;
    }

    if (path === '/api/conversations' && method === 'GET') {
      await route.fulfill(json([conversation]));
      return;
    }
    if (path === '/api/conversations' && method === 'POST') {
      await route.fulfill(json(conversation));
      return;
    }
    if (path === '/api/conversations/acquire' && method === 'POST') {
      await route.fulfill(json({ conversation, reused: false }));
      return;
    }
    if (path === `/api/conversations/${conversationId}` && method === 'GET') {
      conversationLoadAttempts += 1;
      if (conversationLoadAttempts <= (options.conversationLoadFailures ?? 0)) {
        allowExpectedResourceFailure(page, 500);
        await route.fulfill(json({ detail: 'Error temporal de carga QA' }, 500));
        return;
      }
      await route.fulfill(json(conversation));
      return;
    }
    if (path === `/api/conversations/${conversationId}` && method === 'PATCH') {
      const body = request.postDataJSON() as { title?: string };
      await route.fulfill(json({ ...conversation, title: body.title ?? conversation.title }));
      return;
    }
    if (path === `/api/conversations/${conversationId}` && method === 'DELETE') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === `/api/conversations/${conversationId}/messages` && method === 'POST') {
      streamAttempts += 1;
      if (streamAttempts <= (options.streamFailuresBeforeSuccess ?? 0)) {
        allowExpectedResourceFailure(page, 500);
        allowExpectedConsoleError(page, '[ChatArea] Failed to send message');
        await route.fulfill(json({ detail: 'Error temporal de streaming QA' }, 500));
        return;
      }
      if (options.holdFirstStream && streamAttempts === 1) {
        await new Promise<void>((resolve) => {
          releaseHeldStream = resolve;
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify('Respuesta de streaming QA')}\n\ndata: [DONE]\n\n`,
      });
      return;
    }
    if (path === '/api/videos' && method === 'GET') {
      await route.fulfill(json([video]));
      return;
    }

    if (path === '/api/admin/videos' && method === 'GET') {
      await route.fulfill(json({ videos: [video] }));
      return;
    }
    if (path === '/api/admin/videos/search' && method === 'GET') {
      await route.fulfill(json({ videos: [video] }));
      return;
    }
    if (path === '/api/admin/videos' && method === 'POST') {
      await route.fulfill(json({ video_id: videoId, chunks_created: 3, status: 'completed' }, 201));
      return;
    }
    if (path === '/api/admin/videos/sync-channel' && method === 'POST') {
      await route.fulfill(
        json({
          sync_run_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'completed',
          videos_total: 1,
          videos_new: 0,
          videos_error: 0,
        }),
      );
      return;
    }
    if (path === `/api/admin/videos/${videoId}/re-sync` && method === 'POST') {
      await route.fulfill(json({ video_id: videoId, chunks_created: 3, status: 'completed' }));
      return;
    }
    if (path === `/api/admin/videos/${videoId}` && method === 'DELETE') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (path === '/api/clinical-threads' && method === 'GET') {
      await route.fulfill(
        json([
          {
            id: threadId,
            title: currentClinicalThread.title,
            active_patient_id: patientId,
            active_turn_id: null,
            updated_at: currentClinicalThread.updated_at,
            preview: null,
            approval_pending: (currentClinicalThread.actions as unknown[]).length > 0,
          },
        ]),
      );
      return;
    }
    if (path === '/api/clinical-threads/acquire' && method === 'POST') {
      await route.fulfill(json({ thread: currentClinicalThread, reused: false }, 201));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}` && method === 'GET') {
      await route.fulfill(json(currentClinicalThread));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/active-patient` && method === 'PATCH') {
      await route.fulfill(json(currentClinicalThread));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/turns` && method === 'POST') {
      const body = request.postDataJSON() as { content?: string; turn_id?: string };
      const turn = body.turn_id ?? 'turn-qa';
      const artifact = {
        id: 'draft-qa',
        owner_user_id: currentClinicalThread.owner_user_id,
        thread_id: threadId,
        turn_id: turn,
        patient_id: patientId,
        artifact_type: 'clinical_draft',
        status: 'draft',
        source_note: body.content ?? '',
        generated_draft: draft,
        draft,
        evolution_at: '2026-01-15T12:01:00-03:00',
        created_at: '2026-01-15T12:01:00Z',
        updated_at: '2026-01-15T12:01:00Z',
        resolved_at: null,
        patient,
      };
      const messages = currentClinicalThread.messages as Array<Record<string, unknown>>;
      const artifacts = currentClinicalThread.artifacts as Array<Record<string, unknown>>;
      currentClinicalThread = {
        ...currentClinicalThread,
        messages: [
          ...messages,
          {
            id: `user-${turn}`,
            thread_id: threadId,
            turn_id: turn,
            role: 'user',
            content: body.content ?? '',
            created_at: '2026-01-15T12:00:58Z',
          },
          {
            id: `assistant-${turn}`,
            thread_id: threadId,
            turn_id: turn,
            role: 'assistant',
            content: 'Preparé un borrador para revisión.',
            created_at: '2026-01-15T12:01:01Z',
          },
        ],
        artifacts: [...artifacts, artifact],
      };
      const payload = [
        clinicalEvent(
          'turn.started',
          1,
          'turn-start',
          'turn',
          { user_content: body.content ?? '' },
          turn,
          'running',
        ),
        clinicalEvent(
          'item.completed',
          2,
          'draft-qa',
          'clinical_draft',
          {
            draft,
            source_note: body.content ?? '',
            patient_id: patientId,
            evolution_at: '2026-01-15T12:01:00-03:00',
            created_at: '2026-01-15T12:01:00Z',
          },
          turn,
        ),
        clinicalEvent(
          'item.completed',
          3,
          'assistant-qa',
          'assistant_message',
          {
            content: 'Preparé un borrador para revisión.',
            created_at: '2026-01-15T12:01:01Z',
          },
          turn,
        ),
        clinicalEvent('turn.completed', 4, 'turn-complete', 'turn', {}, turn),
      ].join('');
      if (options.holdClinicalStream) {
        await new Promise<void>((resolve) => {
          releaseHeldStream = resolve;
          resolveClinicalStreamEntered?.();
        });
      }
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: payload });
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/artifacts/draft-qa` && method === 'PATCH') {
      const body = request.postDataJSON() as {
        draft?: Record<string, unknown>;
        source_note?: string;
        evolution_at?: string;
      };
      const artifacts = currentClinicalThread.artifacts as Array<Record<string, unknown>>;
      const updatedArtifact = {
        ...artifacts.find((artifact) => artifact.id === 'draft-qa'),
        ...(body.draft ? { draft: body.draft, generated_draft: body.draft } : {}),
        ...(body.source_note ? { source_note: body.source_note } : {}),
        ...(body.evolution_at ? { evolution_at: body.evolution_at } : {}),
      };
      currentClinicalThread = {
        ...currentClinicalThread,
        artifacts: artifacts.map((artifact) =>
          artifact.id === 'draft-qa' ? updatedArtifact : artifact,
        ),
      };
      await route.fulfill(json(updatedArtifact));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/prepare-save` && method === 'POST') {
      const body = request.postDataJSON() as { turn_id?: string; artifact_id?: string };
      const action = {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        thread_id: threadId,
        turn_id: body.turn_id ?? 'turn-qa',
        artifact_id: body.artifact_id ?? 'draft-qa',
        patient_id: patientId,
        action_type: 'save_evolution',
        proposal_payload: {
          evolution_id: evolutionId,
          patient_id: patientId,
          evolution_at: evolution.evolution_at,
          raw_note: 'Nota QA',
          generated_text: draft.findings,
          final_text: draft.findings,
        },
        proposal_hash: 'a'.repeat(64),
        status: 'pending',
        expires_at: '2026-01-15T12:30:00Z',
        created_at: '2026-01-15T12:02:00Z',
        resolved_at: null,
        patient,
      };
      currentClinicalThread = {
        ...currentClinicalThread,
        pending_action: action,
        actions: [...(currentClinicalThread.actions as Array<Record<string, unknown>>), action],
      };
      await route.fulfill(json(action));
      return;
    }
    if (
      path === '/api/clinical-actions/dddddddd-dddd-4ddd-8ddd-dddddddddddd/resolve' &&
      method === 'POST'
    ) {
      const resolvedAction = {
        ...(currentClinicalThread.actions as Array<Record<string, unknown>>)[0],
        status: 'approved',
        result: evolution,
        result_resource_id: evolutionId,
        resolved_at: '2026-01-15T12:03:00Z',
      };
      currentClinicalThread = {
        ...currentClinicalThread,
        pending_action: null,
        actions: [resolvedAction],
      };
      await route.fulfill(json(resolvedAction));
      return;
    }
    if (
      path === '/api/clinical-actions/dddddddd-dddd-4ddd-8ddd-dddddddddddd/return-to-editing' &&
      method === 'POST'
    ) {
      currentClinicalThread = {
        ...currentClinicalThread,
        pending_action: null,
        actions: (currentClinicalThread.actions as Array<Record<string, unknown>>).map((action) =>
          action.id === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
            ? { ...action, status: 'declined' }
            : action,
        ),
      };
      await route.fulfill(
        json({
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          thread_id: threadId,
          artifact_id: 'draft-qa',
        }),
      );
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/drafts` && method === 'POST') {
      await route.fulfill(json(draft));
      return;
    }

    if (path.startsWith('/api/google-drive/sources')) {
      await route.fulfill(json({ files: [], next_page_token: null }));
      return;
    }
    if (path.startsWith('/api/google-drive/evolution-journals')) {
      await route.fulfill(json({ journals: [] }));
      return;
    }
    if (path.startsWith('/api/google-drive/files')) {
      await route.fulfill(json({ files: [], next_page_token: null }));
      return;
    }
    if (path === '/api/google-drive/oauth/start' && method === 'POST') {
      await route.fulfill(json({ authorization_url: 'https://accounts.google.com/qa' }));
      return;
    }
    if (path === '/api/transcriptions' && method === 'POST') {
      await route.fulfill(json({ text: 'Texto dictado QA.' }));
      return;
    }

    qaRuntimeDiagnostics.get(page)?.unexpectedApiRequests.push(`${method} ${path}`);
    await route.fulfill(json({ detail: `Unexpected QA API request: ${method} ${path}` }, 500));
  });

  return {
    releaseHeldStream: () => releaseHeldStream?.(),
    clinicalStreamEntered,
  };
}

async function captureView(
  page: Page,
  name: string,
  fullPage = true,
  visualTarget?: Locator,
): Promise<void> {
  const appShell = page.locator('.app-layout');
  const target = (await appShell.count()) > 0 ? appShell : page.locator('body');
  await expect(target).toMatchAriaSnapshot({ name: `${name}.aria.yml` });
  if (visualTarget) {
    await expect(visualTarget).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      maxDiffPixels: 2500,
    });
    return;
  }
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage,
    animations: 'disabled',
    maxDiffPixels: 2500,
  });
}

interface DialogAuditOptions {
  requireDescription?: boolean;
}

async function auditDialog(
  page: Page,
  name: string,
  options: DialogAuditOptions = {},
): Promise<void> {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  const isNativeModal = await dialog.evaluate((element) => element.tagName === 'DIALOG');
  if (isNativeModal) {
    await expect(dialog).toHaveAttribute('open', '');
  } else {
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
  }
  await expect(dialog.getByRole('heading').first()).toBeVisible();
  const description = await dialog.evaluate((element) => {
    const descriptionId = element.getAttribute('aria-describedby');
    return descriptionId ? document.getElementById(descriptionId)?.textContent?.trim() : null;
  });
  if (options.requireDescription) expect(description).not.toBeNull();
  if (description !== null) expect(description).not.toBe('');
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  const controls = dialog.locator('button, input, textarea, select, [role="button"]');
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    await expect(control).toBeVisible();
    if (await control.isEnabled()) await expect(control).toBeEnabled();
    expect(
      await control.evaluate((element) => {
        const labelledBy = element.getAttribute('aria-labelledby');
        const labelledByText = labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? '')
              .join(' ')
          : '';
        const labels =
          'labels' in element
            ? Array.from((element as HTMLInputElement).labels ?? [])
                .map((label) => label.textContent ?? '')
                .join(' ')
            : '';
        return Boolean(
          [
            element.getAttribute('aria-label'),
            labelledByText,
            labels,
            element.textContent,
            element.getAttribute('placeholder'),
            element.getAttribute('title'),
          ]
            .map((value) => value?.trim())
            .some(Boolean),
        );
      }),
    ).toBe(true);
  }
  const focusable = dialog.locator(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  );
  const focusableCount = await focusable.count();
  expect(focusableCount).toBeGreaterThan(0);
  for (let index = 0; index < Math.min(focusableCount + 1, 6); index += 1) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  }
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  qaRuntimeDiagnostics.set(page, {
    errors: [],
    unexpectedApiRequests: [],
    expectedResourceFailures: [],
    expectedConsoleErrors: [],
  });
  page.on('pageerror', (error) =>
    qaRuntimeDiagnostics.get(page)?.errors.push(`pageerror: ${error.message}`),
  );
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const diagnostics = qaRuntimeDiagnostics.get(page);
    const expectedConsoleIndex =
      diagnostics?.expectedConsoleErrors.findIndex((fragment) =>
        message.text().includes(fragment),
      ) ?? -1;
    if (expectedConsoleIndex >= 0) {
      diagnostics?.expectedConsoleErrors.splice(expectedConsoleIndex, 1);
      return;
    }
    const status = Number(message.text().match(/status of (\d+)/i)?.[1]);
    const expectedIndex = Number.isNaN(status)
      ? -1
      : (diagnostics?.expectedResourceFailures.indexOf(status) ?? -1);
    if (expectedIndex >= 0) {
      diagnostics?.expectedResourceFailures.splice(expectedIndex, 1);
      return;
    }
    diagnostics?.errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    qaRuntimeDiagnostics
      .get(page)
      ?.errors.push(`requestfailed: ${request.method()} ${request.url()}`);
  });
  await page.clock.install({ time: '2026-01-15T12:00:00Z' });
});

test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = qaRuntimeDiagnostics.get(page) ?? {
    errors: [],
    unexpectedApiRequests: [],
    expectedResourceFailures: [],
    expectedConsoleErrors: [],
  };
  if (diagnostics.errors.length > 0 || diagnostics.unexpectedApiRequests.length > 0) {
    await testInfo.attach('qa-runtime-diagnostics.json', {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: 'application/json',
    });
  }
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.unexpectedApiRequests).toEqual([]);
});

test('public auth and not-found views expose their controls and outcomes', async ({ page }) => {
  await installQaRoutes(page, { authenticated: false });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await captureView(page, 'qa-login');

  await page.getByLabel('Correo electrónico').fill('invalid@example.com');
  await page.getByLabel('Contraseña').fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');

  await page.getByLabel('Correo electrónico').fill('qa@example.com');
  await page.getByLabel('Contraseña').fill('correcta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/patients\/?$/);

  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  await page.getByLabel('Correo electrónico').fill('new@example.com');
  await page.getByLabel('Contraseña (8+ caracteres)').fill('corta');
  await expect(page.getByLabel('Contraseña (8+ caracteres)')).toHaveAttribute('minlength', '8');
  expect(
    await page
      .getByLabel('Contraseña (8+ caracteres)')
      .evaluate((element) => (element as HTMLInputElement).checkValidity()),
  ).toBe(false);
  await page.getByRole('button', { name: 'Registrarse' }).click();
  await captureView(page, 'qa-signup');
  await page.getByLabel('Contraseña (8+ caracteres)').fill('correcta123');
  await page.getByRole('button', { name: 'Registrarse' }).click();
  await expect(page).toHaveURL(/\/patients\/?$/);

  await page.goto('/ruta-qa-inexistente');
  await expect(page.getByText('Página no encontrada')).toBeVisible();
  await expect(page.getByRole('link', { name: /volver|inicio|pacientes/i })).toBeVisible();
  await captureView(page, 'qa-not-found');
});

test('patients, patient detail, and new evolution preserve dialog contracts', async ({ page }) => {
  await installQaRoutes(page);
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ana Pérez/ })).toBeVisible();
  await captureView(page, 'qa-patients');

  await page.getByPlaceholder('Buscar por nombre o RUT...').fill('sin resultado');
  await expect(page.getByText(/No encontramos pacientes/)).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(page.getByRole('link', { name: /Ana Pérez/ })).toBeVisible();

  const newPatientOpener = page.getByRole('button', { name: '+ Nuevo paciente' });
  await newPatientOpener.click();
  await auditDialog(page, 'Nuevo paciente');
  const createDialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await createDialog.getByLabel('Nombres').fill('QA');
  await createDialog.getByLabel('Apellidos').fill('Paciente');
  await createDialog.getByLabel('RUT').fill('12.345.678-5');
  await createDialog.getByLabel('Fecha de nacimiento').fill('31/02/2024');
  await createDialog.getByRole('button', { name: 'Crear paciente' }).click();
  await expect(createDialog.getByLabel('Fecha de nacimiento')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(createDialog.getByText('Ingresa una fecha válida')).toBeVisible();
  await createDialog.getByRole('button', { name: 'Cancelar' }).click();
  await auditDialog(page, '¿Salir sin guardar?', { requireDescription: true });
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await createDialog.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(createDialog).toBeHidden();
  await expect(newPatientOpener).toBeFocused();

  await newPatientOpener.click();
  await createDialog.getByLabel('Nombres').fill('Paciente creado');
  await createDialog.getByLabel('Apellidos').fill('QA');
  await createDialog.getByLabel('RUT').fill('12.345.678-5');
  await createDialog.getByLabel('Fecha de nacimiento').fill('15/01/1990');
  await createDialog.getByRole('button', { name: 'Crear paciente' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/patients/${patientId}(?:/evolutions/${evolutionId})?$`),
  );

  await page.goto(`/patients/${patientId}/evolutions/${evolutionId}`);
  await expect(page.getByRole('heading', { name: 'Evolución dental' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historial de evoluciones' })).toBeVisible();
  await captureView(page, 'qa-patient-detail');

  const editPatientOpener = page.getByRole('button', { name: 'Editar paciente' });
  await editPatientOpener.click();
  await auditDialog(page, 'Editar paciente');
  const editDialog = page.getByRole('dialog', { name: 'Editar paciente' });
  await editDialog.getByLabel('Nombres').fill('Ana QA');
  await editDialog.getByRole('button', { name: 'Cancelar' }).click();
  await auditDialog(page, '¿Salir sin guardar?', { requireDescription: true });
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(editPatientOpener).toBeFocused();

  await editPatientOpener.click();
  await expect(editDialog.getByLabel('Nombres')).toHaveValue('Ana');
  await editDialog.getByLabel('Nombres').fill('Ana QA');
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Ana QA Pérez' })).toBeVisible();

  await page.goto(`/patients/${patientId}/evolutions/new`);
  await expect(page.getByRole('heading', { name: 'Nueva evolución dental' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar borrador con IA' })).toBeDisabled();
  await captureView(page, 'qa-new-evolution-empty');
  await page.getByLabel('Nota clínica').fill('Nota que no debe perderse QA.');
  await page.getByRole('link', { name: /Volver a Ana Pérez/ }).click();
  await auditDialog(page, '¿Salir sin guardar?', { requireDescription: true });
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/evolutions/new$`));
  await page.getByRole('button', { name: 'Cambiar fecha y hora' }).click();
  await expect(page.getByLabel('Fecha de evolución')).toBeVisible();
  await page.getByLabel('Nota clínica').fill('Control preventivo QA.');
  await page.getByRole('button', { name: 'Generar borrador con IA' }).click();
  await expect(page.getByRole('heading', { name: 'Borrador generado' })).toBeVisible();
  await captureView(page, 'qa-new-evolution-review');

  const review = page.locator('.evolution-review-artifact');
  await review.locator('button', { hasText: 'Editar' }).first().click();
  await review.getByRole('button', { name: 'Editar Hallazgos' }).click();
  await page.getByRole('textbox', { name: 'Hallazgos' }).fill('Hallazgo QA editado.');
  await review.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.getByRole('button', { name: 'Corregir nota y regenerar' }).click();
  const regenerateRequestButton = page.getByRole('button', {
    name: 'Regenerar borrador',
    exact: true,
  });
  await regenerateRequestButton.click();
  await auditDialog(page, 'Regenerar evolución', { requireDescription: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Regenerar evolución' })).toBeHidden();
  await expect(regenerateRequestButton).toBeFocused();
  await regenerateRequestButton.click();
  await auditDialog(page, 'Regenerar evolución', { requireDescription: true });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await regenerateRequestButton.click();
  await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Borrador generado' })).toBeVisible();
  const saveEvolutionButton = page.getByRole('button', { name: 'Guardar evolución' });
  await saveEvolutionButton.click();
  await auditDialog(page, 'Confirmar evolución', { requireDescription: true });
  await page.getByRole('button', { name: 'Volver a revisar' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar evolución' })).toBeHidden();
  await expect(saveEvolutionButton).toBeFocused();
  await saveEvolutionButton.click();
  await auditDialog(page, 'Confirmar evolución', { requireDescription: true });
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/evolutions/${evolutionId}$`));
});

test('chat, conversation menus, library dialogs, and mobile navigation work together', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.goto('/chat');
  const input = page.getByLabel('Pregunta sobre la biblioteca de videos');
  await expect(input).toBeVisible();
  await captureView(page, 'qa-chat-empty');

  const starter = page.locator('.chat-starter-button').first();
  await expect(starter).toBeVisible();
  await starter.click();
  await expect(input).not.toBeEmpty();
  await page.getByRole('button', { name: 'Conversación QA', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${conversationId}$`));
  await expect(page.getByText('Respuesta hidratada de QA.')).toBeVisible();
  await captureView(page, 'qa-chat-conversation');

  await input.fill('Pregunta de streaming QA');
  await page.getByRole('button', { name: /Enviar mensaje/i }).click();
  await expect(page.getByText('Respuesta de streaming QA')).toBeVisible();

  const conversationRow = page.locator('#app-sidebar .conversation-item').first();
  await conversationRow.hover();
  const conversationActionsOpener = conversationRow.getByRole('button', {
    name: /acciones para conversación qa/i,
  });
  await conversationActionsOpener.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await auditDialog(page, '¿Eliminar conversación?', { requireDescription: true });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(conversationActionsOpener).toBeFocused();

  const libraryOpener = page.getByRole('button', { name: 'Biblioteca' });
  await libraryOpener.click();
  await auditDialog(page, 'Biblioteca de videos');
  const library = page.getByRole('dialog', { name: 'Biblioteca de videos' });
  await expect(library.getByRole('heading', { name: 'Biblioteca de videos' })).toBeVisible();
  await captureView(page, 'qa-video-library', true, library);
  await library.getByRole('searchbox', { name: 'Buscar videos' }).fill('RAG');
  const addVideoOpener = library.getByRole('button', { name: /Agregar video/ });
  await addVideoOpener.click();
  await auditDialog(page, 'Agregar video');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Agregar video' })).toBeHidden();
  await expect(addVideoOpener).toBeFocused();
  await addVideoOpener.click();
  await auditDialog(page, 'Agregar video');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog', { name: 'Agregar video' })).toBeHidden();
  await library.getByRole('button', { name: 'Cerrar biblioteca de videos' }).click();
  await expect(library).toBeHidden();
  await expect(libraryOpener).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar navegación' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar navegación' }).click();
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible();
});

test('chat recovers from hydration and streaming failures through retry', async ({ page }) => {
  await installQaRoutes(page, {
    // React StrictMode starts the initial effect twice in the dev bundle.
    conversationLoadFailures: 2,
    streamFailuresBeforeSuccess: 1,
  });
  await page.goto(`/c/${conversationId}`);

  const hydrationError = page.getByText('No pudimos cargar los mensajes. Intenta nuevamente.');
  const hydratedMessage = page.getByText('Respuesta hidratada de QA.');
  for (let retry = 0; retry < 2; retry += 1) {
    await expect(hydrationError.or(hydratedMessage)).toBeVisible();
    if (await hydratedMessage.isVisible()) break;
    await page.getByRole('button', { name: 'Reintentar' }).click();
  }
  await expect(hydratedMessage).toBeVisible();

  const input = page.getByLabel('Pregunta sobre la biblioteca de videos');
  await input.fill('Pregunta que falla una vez');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('No pudimos enviar el mensaje. Intenta nuevamente.')).toBeVisible();
  await expect(input).toHaveValue('Pregunta que falla una vez');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Respuesta de streaming QA')).toBeVisible();
});

test('chat queues a second message and drains it after the active stream', async ({ page }) => {
  const controls = await installQaRoutes(page, { holdFirstStream: true });
  try {
    await page.goto(`/c/${conversationId}`);
    await expect(page.getByText('Respuesta hidratada de QA.')).toBeVisible();

    const input = page.getByLabel('Pregunta sobre la biblioteca de videos');
    await input.fill('Primera pregunta QA');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByRole('button', { name: 'Detener respuesta' })).toBeVisible();

    await input.fill('Segunda pregunta en cola');
    await page.getByRole('button', { name: 'Poner mensaje en cola' }).click();
    const queued = page.getByLabel('Mensaje en cola', { exact: true });
    await expect(queued).toContainText('Segunda pregunta en cola');
    await expect(queued.getByRole('button', { name: 'Editar mensaje en cola' })).toBeVisible();
    await expect(queued.getByRole('button', { name: 'Eliminar mensaje en cola' })).toBeVisible();

    controls.releaseHeldStream();
    await expect(page.getByText('Respuesta de streaming QA')).toHaveCount(2);
    await expect(queued).toBeHidden();
  } finally {
    controls.releaseHeldStream();
  }
});

test('clinical assistant exposes the review lifecycle and Drive surface', async ({ page }) => {
  await installQaRoutes(page, { driveEnabled: true });
  await page.goto(`/a/${threadId}`);
  await expect(
    page
      .getByRole('heading', { name: 'Evolución clínica' })
      .or(page.getByRole('heading', { name: 'Trabaja más rápido con tus evoluciones' })),
  ).toBeVisible();
  await expect(page.getByLabel('Nota clínica')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  await captureView(page, 'qa-clinical-empty');

  await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
  await expect(page.getByRole('heading', { name: 'Google Drive' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Cerrar Google Drive' }).click();

  await page.getByLabel('Nota clínica').fill('Nota clínica QA.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('Preparé un borrador para revisión.')).toBeVisible();
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  const reviewOpener = page.getByRole('button', { name: 'Revisar y guardar' });
  await reviewOpener.click();
  await auditDialog(page, 'Guardar evolución');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeHidden();

  await page.goto(`/a/${threadId}`);
  const approvalOpener = page.getByRole('button', { name: 'Confirmar guardado' });
  await approvalOpener.click();
  await auditDialog(page, 'Guardar evolución');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeHidden();
  await expect(approvalOpener).toBeFocused();
  await approvalOpener.click();
  await auditDialog(page, 'Guardar evolución');
  await page.getByRole('button', { name: 'Volver a editar' }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
  await expect(page.locator('.drive-sheet-content')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('clinical stream survives closing Drive', async ({ page }) => {
  const controls = await installQaRoutes(page, {
    driveEnabled: true,
    holdClinicalStream: true,
  });
  try {
    await page.goto(`/a/${threadId}`);
    const input = page.getByLabel('Nota clínica');
    await expect(input).toBeVisible();

    await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
    await expect(page.getByRole('heading', { name: 'Google Drive' })).toBeVisible();

    await input.fill('Nota durante stream clínico QA.');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await controls.clinicalStreamEntered;
    await expect(page.getByRole('button', { name: 'Detener respuesta' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar Google Drive' }).click();
    await expect(page.getByRole('button', { name: 'Abrir Google Drive' })).toBeVisible();

    controls.releaseHeldStream();
    await expect(page.getByText('Preparé un borrador para revisión.')).toBeVisible();
    await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  } finally {
    controls.releaseHeldStream();
  }
});

test('admin view validates video actions and native confirmation', async ({ page }) => {
  await installQaRoutes(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración de biblioteca' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Videos disponibles en la biblioteca' }),
  ).toBeVisible();
  await captureView(page, 'qa-admin');

  await page.getByPlaceholder('Buscar videos...').fill('RAG');
  await expect(page.locator('tbody tr')).toHaveCount(1);

  const addModalOpener = page.getByRole('button', { name: '+ Agregar video por URL' });
  await addModalOpener.click();
  await auditDialog(page, 'Agregar video por URL');
  const addDialog = page.getByRole('dialog', { name: 'Agregar video por URL' });
  await expect(addDialog.getByRole('button', { name: 'Agregar video' })).toBeDisabled();
  await addDialog.getByLabel('URL de YouTube').fill('https://www.youtube.com/watch?v=qa');
  await addDialog.getByRole('button', { name: 'Agregar video' }).click();
  await expect(page.getByRole('dialog', { name: 'Agregar video por URL' })).toBeHidden();
  await expect(addModalOpener).toBeFocused();

  await page.getByRole('button', { name: 'Sincronizar canal' }).click();
  await expect(page.getByText(/Sincronización del canal completed/)).toBeVisible();
  const row = page.locator('tbody tr').first();
  await row.getByRole('button', { name: 'Sincronizar' }).click();
  await expect(page.getByText(/Video sincronizado/)).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Eliminar');
    await dialog.dismiss();
  });
  await row.getByRole('button', { name: 'Eliminar' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Desliza horizontalmente para ver las acciones.')).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('canonical protected views remain usable at every baseline viewport', async ({ page }) => {
  await installQaRoutes(page, { driveEnabled: true });
  const viewports = [
    { width: 1440, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ];
  const routes = [
    '/',
    '/patients',
    `/patients/${patientId}`,
    `/patients/${patientId}/evolutions/${evolutionId}`,
    `/patients/${patientId}/evolutions/new`,
    '/chat',
    `/c/${conversationId}`,
    '/assistant',
    `/a/${threadId}`,
    '/admin',
    '/ruta-qa-inexistente',
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      if (route === '/') {
        await expect(page).toHaveURL(/\/patients\/?$/);
        await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
      } else if (route === '/ruta-qa-inexistente') {
        await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
      } else if (route === '/admin') {
        await expect(
          page.getByRole('heading', { name: 'Administración de biblioteca' }),
        ).toBeVisible();
      } else {
        await expect(page.locator('#main-content, main, [role="main"]').first()).toBeVisible();
      }
      await assertNoHorizontalOverflow(page);
    }
  }
});
