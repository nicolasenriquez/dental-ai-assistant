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

const patientBId = '8d0f4f7a-2d19-4cc0-9c2b-3d1f5a6e7b80';
const patientB = {
  id: patientBId,
  first_name: 'Bruno',
  last_name: 'Ríos',
  rut_masked: '9.876.•••-2',
  birth_date: '1985-06-12',
  last_evolution_at: '2026-08-20T14:10:00Z',
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

interface QaDriveFile {
  id: string;
  name: string;
  version: string;
  mimeType: string;
  modifiedTime: string;
  content: string;
}

interface QaRouteOptions {
  authenticated?: boolean;
  admin?: boolean;
  driveEnabled?: boolean;
  /** Auth-config `drive_enabled` when the Drive status should still be disconnected. */
  driveConfigured?: boolean;
  driveFiles?: QaDriveFile[];
  /** Patient directory for `GET /api/patients` and picker search. Defaults to [patient]. */
  patients?: (typeof patient)[];
  /** Consecutive `PATCH active-patient` requests served as 500 before the change succeeds. */
  patientChangeFailures?: number;
  /** Hold the first `PATCH active-patient` request until `releaseHeldPatientChange`. */
  holdPatientChange?: boolean;
  conversationLoadFailures?: number;
  streamFailuresBeforeSuccess?: number;
  holdFirstStream?: boolean;
  persistChatStream?: boolean;
  holdClinicalStream?: boolean;
  /** Consecutive `GET /api/clinical-threads/:id` reads served as 500 before succeeding. */
  clinicalThreadLoadFailures?: number;
  /** Consecutive `POST /api/clinical-actions/:id/resolve` requests served as 502 before reconciling. */
  clinicalResolveFailures?: number;
  /** Initial clinical thread messages, e.g. to render read results in the transcript. */
  clinicalMessages?: Array<Record<string, unknown>>;
  /** Clinical thread title; defaults to the shared fixture title. */
  clinicalThreadTitle?: string;
  /** Clinical thread summaries served by `GET /api/clinical-threads`; defaults to the single shared thread. */
  clinicalThreadSummaries?: Array<Record<string, unknown>>;
  /** Active patient rendered in the clinical thread header; defaults to the shared fixture. */
  clinicalPatient?: typeof patient;
}

interface QaRouteControls {
  releaseHeldStream: () => void;
  clinicalStreamEntered: Promise<void>;
  releaseHeldPatientChange: () => void;
  patientChangeHeld: Promise<void>;
}

interface QaRuntimeDiagnostics {
  errors: string[];
  unexpectedApiRequests: string[];
  expectedResourceFailures: number[];
  expectedConsoleErrors: string[];
}

const qaRuntimeDiagnostics = new WeakMap<Page, QaRuntimeDiagnostics>();

test('review fixes: context decision traps focus and Escape restores the patient control', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.setViewportSize({ width: 834, height: 1000 });
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Nota clínica' });
  await input.fill('Nota sin enviar');
  const patientControl = page.getByRole('button', { name: 'Quitar paciente activo' });
  await patientControl.click();
  const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
  await expect(decision).toBeVisible();
  const remain = decision.getByRole('button', { name: 'Mantener paciente' });
  await expect(remain).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(decision.getByRole('button', { name: 'Descartar y cambiar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(remain).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(decision).toHaveCount(0);
  await expect(patientControl).toBeFocused();
  await expect(input).toHaveValue('Nota sin enviar');
  await expect(page.getByRole('heading', { name: 'Asistente clínico', exact: true })).toBeVisible();
});

interface QaApiMutation {
  method: string;
  path: string;
  body: unknown;
}

function trackQaApiMutations(page: Page): QaApiMutation[] {
  const mutations: QaApiMutation[] = [];
  page.on('request', (request) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) return;
    if (!request.url().includes('/api/')) return;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    mutations.push({ method: request.method(), path: new URL(request.url()).pathname, body });
  });
  return mutations;
}

test.describe('review fixes: context decision browser verification', () => {
  test('keeps the safe keyboard path and unsent work at narrow and desktop widths', async ({
    page,
  }) => {
    await installQaRoutes(page, { driveEnabled: true, driveFiles: [qaDriveFile] });
    const mutations = trackQaApiMutations(page);
    const draft = 'Nota sin enviar para Ana.';

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill(draft);
      await attachQaSource(page, qaDriveFile);
      const before = mutations.length;

      const patientControl = page.getByRole('button', { name: 'Quitar paciente activo' });
      await patientControl.click();
      const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
      await expect(decision).toBeVisible();
      await expect(decision).toContainText('Cambiar a Sin paciente');
      const remain = decision.getByRole('button', { name: 'Mantener paciente' });
      await expect(remain).toBeFocused();
      await expect(decision.getByRole('button', { name: 'Conservar y cambiar' })).toBeVisible();
      await expect(decision.getByRole('button', { name: 'Descartar y cambiar' })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      // One focus owner: the background composer leaves the accessibility tree.
      await expect(page.getByRole('textbox', { name: 'Nota clínica' })).toHaveCount(0);
      await page.keyboard.press('Shift+Tab');
      await expect(decision.getByRole('button', { name: 'Descartar y cambiar' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(remain).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(decision).toHaveCount(0);
      await expect(patientControl).toBeFocused();
      await expect(input).toHaveValue(draft);
      await expect(page.getByRole('button', { name: `Quitar ${qaDriveFile.name}` })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();
      expect(mutations.slice(before)).toEqual([]);

      await patientControl.click();
      await expect(decision).toBeVisible();
      await decision.getByRole('button', { name: 'Mantener paciente' }).click();
      await expect(decision).toHaveCount(0);
      await expect(patientControl).toBeFocused();
      await expect(input).toHaveValue(draft);
      await expect(page.getByRole('button', { name: `Quitar ${qaDriveFile.name}` })).toBeVisible();
      expect(mutations.slice(before)).toEqual([]);
      console.log(
        '[C2-KEYBOARD]',
        JSON.stringify({
          viewport: `${viewport.width}x${viewport.height}`,
          focusPath:
            'initiating-patient-control > remain > discard > remain > Escape > patient-control',
          mutations: mutations.length - before,
        }),
      );
    }
  });

  test('records one exact patient-change identity and keeps the decision open on failure', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      patients: [patient, patientB],
      patientChangeFailures: 1,
    });
    const mutations = trackQaApiMutations(page);
    const draft = 'Nota sin enviar para Ana.';
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/a/${threadId}`);
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await input.fill(draft);

    const openDecision = async () => {
      await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
      await page.getByRole('option', { name: /Bruno Ríos/ }).click();
      const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
      await expect(decision).toBeVisible();
      await expect(decision).toContainText('Cambiar a Bruno Ríos');
      return decision;
    };

    let decision = await openDecision();
    const beforeFailure = mutations.length;
    await decision.getByRole('button', { name: 'Conservar y cambiar' }).click();

    // The failed PATCH keeps the decision, its alert and all work recoverable.
    await expect(decision).toBeVisible();
    await expect(decision.getByRole('alert')).toHaveText('No pudimos cambiar el paciente activo.');
    await expect(decision.getByRole('button', { name: 'Conservar y cambiar' })).toBeEnabled();
    await expect(decision.getByRole('button', { name: 'Descartar y cambiar' })).toBeEnabled();
    await expect(input).toHaveCount(0);
    expect(mutations.slice(beforeFailure)).toEqual([
      {
        method: 'PATCH',
        path: `/api/clinical-threads/${threadId}/active-patient`,
        body: { patient_id: patientBId },
      },
    ]);

    await decision.getByRole('button', { name: 'Mantener paciente' }).click();
    await expect(decision).toHaveCount(0);
    await expect(input).toHaveValue(draft);
    expect(mutations.slice(beforeFailure)).toHaveLength(1);

    decision = await openDecision();
    await decision.getByRole('button', { name: 'Descartar y cambiar' }).click();
    await expect(decision).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar paciente activo' })).toContainText(
      'Bruno Ríos',
    );
    await expect(input).toHaveValue('');
    expect(mutations.slice(beforeFailure)).toEqual([
      {
        method: 'PATCH',
        path: `/api/clinical-threads/${threadId}/active-patient`,
        body: { patient_id: patientBId },
      },
      {
        method: 'PATCH',
        path: `/api/clinical-threads/${threadId}/active-patient`,
        body: { patient_id: patientBId },
      },
    ]);
    expect(mutations.filter((mutation) => mutation.path.endsWith('/turns'))).toEqual([]);
    console.log(
      '[C2-IDENTITY]',
      JSON.stringify({
        failedIdentity: `PATCH active-patient ${JSON.stringify({ patient_id: patientBId })}`,
        discardedIdentity: `PATCH active-patient ${JSON.stringify({ patient_id: patientBId })}`,
        mutationCount: mutations.length - beforeFailure,
      }),
    );
  });

  test('survives an upstream guard cancellation with the decision and draft intact', async ({
    page,
  }) => {
    await installQaRoutes(page, { driveEnabled: true, driveFiles: [qaDriveFile] });
    const mutations = trackQaApiMutations(page);
    const draft = 'Nota para Ana antes del cambio.';
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/a/${threadId}`);

    // Dirty Drive state registers the upstream transition blocker.
    await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
    await page.getByRole('tab', { name: 'Documentos' }).click();
    await page.getByRole('button', { name: `Abrir ${qaDriveFile.name}` }).click();
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Contenido del documento').fill(`${qaDriveFile.content} Modificado QA.`);
    await page.getByRole('button', { name: 'Cerrar Google Drive' }).click();

    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await input.fill(draft);
    await page.getByRole('button', { name: 'Quitar paciente activo' }).click();
    const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
    await expect(decision).toBeVisible();
    const beforeGuard = mutations.length;
    await decision.getByRole('button', { name: 'Conservar y cambiar' }).click();

    const dirtyDialog = page.getByRole('dialog', { name: 'Hay cambios sin guardar' });
    await expect(dirtyDialog).toBeVisible();
    await dirtyDialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dirtyDialog).toHaveCount(0);

    // Cancelling the upstream guard keeps the original boundary and work recoverable.
    await expect(decision).toBeVisible();
    await expect(decision.getByRole('button', { name: 'Conservar y cambiar' })).toBeFocused();
    await expect(decision.getByRole('button', { name: 'Mantener paciente' })).toBeEnabled();
    await expect(decision.getByRole('button', { name: 'Descartar y cambiar' })).toBeEnabled();
    expect(mutations.slice(beforeGuard)).toEqual([]);

    await decision.getByRole('button', { name: 'Mantener paciente' }).click();
    await expect(decision).toHaveCount(0);
    await expect(input).toHaveValue(draft);
    expect(mutations.slice(beforeGuard)).toEqual([]);
    console.log(
      '[C2-NESTED-GUARD]',
      JSON.stringify({
        upstream: 'Hay cambios sin guardar > Cancelar',
        focusOwner: 'Conservar y cambiar',
        draftPreserved: true,
        mutations: mutations.length - beforeGuard,
      }),
    );
  });
});

test('review fixes: contextual composer gives writing a full row by pane width', async ({
  page,
}) => {
  await installQaRoutes(page);
  for (const viewport of composerMatrixViewports) {
    await page.setViewportSize(viewport);
    await page.goto(`/patients/${patientId}`);
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await expect(input).toBeVisible();
    await input.fill('Nota clínica suficientemente larga para comprobar el espacio disponible.');
    const bounds = await measureComposer(page);
    expect(bounds.inputWidth).toBeGreaterThan(bounds.shellWidth * 0.75);
    expect(bounds.toolbarTop).toBeGreaterThanOrEqual(bounds.inputBottom);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
    console.log(
      `[C1-CONTEXTUAL] ${JSON.stringify({
        viewport: `${viewport.width}x${viewport.height}`,
        shell: Math.round(bounds.shellWidth),
        input: `${Math.round(bounds.inputWidth)}x${Math.round(bounds.inputHeight)}`,
        toolbarRow: bounds.toolbarTop >= bounds.inputBottom ? 'below' : 'shared',
      })}`,
    );
  }
});

test.describe('review fixes: contextual Sheet width ownership', () => {
  for (const viewport of [
    { width: 767, height: 1024 },
    { width: 768, height: 1024 },
    { width: 1023, height: 768 },
    { width: 1024, height: 768 },
  ]) {
    test(`keeps the 768/1024 contextual composition at ${viewport.width}px`, async ({ page }) => {
      await installQaRoutes(page);
      await page.setViewportSize(viewport);
      await page.goto(`/patients/${patientId}`);
      const trigger = page.getByRole('button', { name: 'Asistente', exact: true });
      await trigger.click();
      await expect(page.getByTestId('clinical-composer')).toBeVisible();

      if (viewport.width < 768) {
        await expect(page).toHaveURL(new RegExp(`/a/${threadId}`));
        await expect(page.getByRole('dialog')).toHaveCount(0);
        return;
      }

      const dialog = page.getByRole('dialog', { name: 'Asistente clínico' });
      if (viewport.width >= 1024) {
        await expect(dialog).toHaveCount(0);
        const panel = page.getByRole('complementary', { name: 'Asistente del paciente' });
        await expect(panel).toBeVisible();
        const panelWidth = await panel.evaluate((node) => node.getBoundingClientRect().width);
        expect(
          Math.abs(panelWidth - Math.min(Math.max(0.38 * viewport.width, 420), 520)),
        ).toBeLessThanOrEqual(2);
        return;
      }

      await expect(dialog).toBeVisible();
      const sheetWidth = await dialog.evaluate((node) => node.getBoundingClientRect().width);
      expect(Math.abs(sheetWidth - Math.min(0.88 * viewport.width, 560))).toBeLessThanOrEqual(2);
      await expect(dialog.getByRole('button', { name: 'Cerrar' })).toHaveCount(1);
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      expect(
        await dialog.evaluate(
          (node) =>
            Math.abs(node.getBoundingClientRect().height - window.innerHeight) <= 1 &&
            Math.abs(node.getBoundingClientRect().top) <= 1,
        ),
      ).toBe(true);
      await assertNoHorizontalOverflow(page);
      await dialog.hover();
      await page.mouse.wheel(0, 600);
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);

      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      const note = 'Nota clínica del Sheet contextual.';
      await input.pressSequentially(note);
      await expect(input).toHaveValue(note);
      await input.evaluate((element) => {
        element.setSelectionRange(5, 12);
        (element as HTMLElement).dataset.qaSheetMarker = 'kept';
      });
      const resizedWidth = viewport.width === 768 ? 1023 : 768;
      await page.setViewportSize({ width: resizedWidth, height: viewport.height });
      await expect(dialog).toBeVisible();
      await expect(input).toHaveValue(note);
      expect(
        await input.evaluate((element) => ({
          start: element.selectionStart,
          end: element.selectionEnd,
        })),
      ).toEqual({ start: 5, end: 12 });
      expect(
        await input.evaluate((element) => (element as HTMLElement).dataset.qaSheetMarker),
      ).toBe('kept');
      const resizedSheet = await dialog.evaluate((node) => node.getBoundingClientRect().width);
      expect(Math.abs(resizedSheet - Math.min(0.88 * resizedWidth, 560))).toBeLessThanOrEqual(2);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('keeps the default Drive Sheet width at 768px', async ({ page }) => {
    await installQaRoutes(page, { driveEnabled: true, driveFiles: [qaDriveFile] });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/a/${threadId}`);
    await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
    const sheet = page.locator('.drive-sheet-workspace');
    await expect(sheet).toBeVisible();
    const width = await sheet.evaluate((node) => node.getBoundingClientRect().width);
    expect(Math.abs(width - Math.min(0.92 * 768, 460))).toBeLessThanOrEqual(2);
  });
});

test.describe('review fixes: individual queue removal', () => {
  const trackMutations = (page: Page): string[] => {
    const mutations: string[] = [];
    page.on('request', (request) => {
      if (
        ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method()) &&
        request.url().includes('/api/')
      ) {
        mutations.push(`${request.method()} ${request.url()}`);
      }
    });
    return mutations;
  };

  test('removes a queued message immediately, by keyboard, with no requests', async ({ page }) => {
    const controls = await installQaRoutes(page, { holdClinicalStream: true });
    const mutations = trackMutations(page);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      const composer = page.getByRole('textbox', { name: 'Nota clínica' });
      await composer.fill('Respuesta en curso');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      for (const message of ['Pendiente uno', 'Pendiente dos']) {
        await composer.fill(message);
        await page.getByRole('button', { name: 'Encolar' }).click();
      }
      await expect(page.getByText('Mensajes en cola 2/3')).toBeVisible();
      const remove = page.getByRole('button', {
        name: 'Quitar mensaje 1 de la cola: Pendiente uno',
      });
      await expect(remove).toHaveText('Quitar');
      await expect(
        page.getByRole('button', { name: 'Quitar mensaje 2 de la cola: Pendiente dos' }),
      ).toBeVisible();
      const before = mutations.length;

      await remove.focus();
      await remove.press('Enter');

      await expect(page.getByText('Mensajes en cola 1/3')).toBeVisible();
      await expect(remove).toHaveCount(0);
      await expect(page.getByText('Pendiente dos')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Detener respuesta' })).toBeVisible();
      await expect(composer).toBeFocused();
      expect(mutations.slice(before)).toEqual([]);
      await assertNoHorizontalOverflow(page);
      console.log(
        '[QUEUE-001-FULL]',
        JSON.stringify({ before, after: mutations.length, count: 'Mensajes en cola 1/3' }),
      );
    } finally {
      controls.releaseHeldStream();
    }
  });

  test('removes a queued message in the narrow contextual Sheet', async ({ page }) => {
    const controls = await installQaRoutes(page, { holdClinicalStream: true });
    const mutations = trackMutations(page);
    try {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`/patients/${patientId}`);
      await page.getByRole('button', { name: 'Asistente', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Asistente clínico' });
      const composer = dialog.getByRole('textbox', { name: 'Nota clínica' });
      await composer.fill('Consulta contextual');
      await dialog.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      await composer.fill('Pendiente contextual');
      await dialog.getByRole('button', { name: 'Encolar' }).click();
      await expect(dialog.getByText('Mensajes en cola 1/3')).toBeVisible();
      const remove = dialog.getByRole('button', {
        name: 'Quitar mensaje 1 de la cola: Pendiente contextual',
      });
      await expect(remove).toHaveText('Quitar');
      const before = mutations.length;

      await remove.click();

      await expect(dialog.getByText(/Mensajes en cola/)).toHaveCount(0);
      await expect(dialog.getByText('Pendiente contextual')).toHaveCount(0);
      await expect(composer).toBeFocused();
      expect(mutations.slice(before)).toEqual([]);
      await assertNoHorizontalOverflow(page);
      console.log(
        '[QUEUE-001-CONTEXTUAL]',
        JSON.stringify({ before, after: mutations.length, width: 768 }),
      );
    } finally {
      controls.releaseHeldStream();
    }
  });
});

const qaDriveFile: QaDriveFile = {
  id: 'file-qa-informe-v12',
  name: 'informe_ortodoncia_revision_v12.pdf',
  version: '12',
  mimeType: 'application/pdf',
  modifiedTime: '2026-01-10T12:00:00Z',
  content: 'Contenido clínico sintético del informe de ortodoncia.',
};

test('review fixes: full assistant composer keeps its writing row by pane width', async ({
  page,
}) => {
  await installQaRoutes(page, { driveEnabled: true, driveFiles: [qaDriveFile] });
  const typedNote =
    'Motivo: control preventivo. Hallazgos: sin cambios. Plan: control en seis meses.';
  const note = `${typedNote}\nSegunda línea del borrador.\nTercera línea del borrador.`;
  for (const viewport of composerMatrixViewports) {
    await page.setViewportSize(viewport);
    await page.goto(`/a/${threadId}`);
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await expect(input).toBeVisible();
    await input.pressSequentially(typedNote);
    await expect(input).toHaveValue(typedNote);
    await input.fill(note);
    const idleBounds = await measureComposer(page);
    console.log(
      `[C1-IDLE] ${JSON.stringify({
        viewport: `${viewport.width}x${viewport.height}`,
        shell: Math.round(idleBounds.shellWidth),
        input: `${Math.round(idleBounds.inputWidth)}x${Math.round(idleBounds.inputHeight)}`,
        toolbarRow: idleBounds.toolbarTop >= idleBounds.inputBottom ? 'below' : 'shared',
      })}`,
    );
    await attachQaSource(page, qaDriveFile);
    await expect(input).toHaveValue(note);
    const bounds = await measureComposer(page);
    // Text leads: the writing row keeps a usable width in every pane.
    expect(bounds.inputWidth).toBeGreaterThanOrEqual(Math.min(420, bounds.shellWidth * 0.9));
    expect(bounds.inputHeight).toBeLessThanOrEqual(144);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
    await expect(page.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    console.log(
      `[C1-MATRIX] ${JSON.stringify({
        viewport: `${viewport.width}x${viewport.height}`,
        shell: Math.round(bounds.shellWidth),
        input: `${Math.round(bounds.inputWidth)}x${Math.round(bounds.inputHeight)}`,
        toolbarRow: bounds.toolbarTop >= bounds.inputBottom ? 'below' : 'shared',
        sources: await page.getByRole('button', { name: `Quitar ${qaDriveFile.name}` }).count(),
        overflow: bounds.scrollWidth - bounds.clientWidth,
      })}`,
    );
  }
});

test('review fixes: narrow composer keeps an attached source removable with the draft intact', async ({
  page,
}) => {
  await installQaRoutes(page, { driveEnabled: true, driveFiles: [qaDriveFile] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/a/${threadId}`);
  const input = page.getByRole('textbox', { name: 'Nota clínica' });
  const note =
    'Nota clínica extensa para comprobar el reflujo del compositor con un documento adjunto.\nSegunda línea del borrador.';
  await input.fill(note);

  await attachQaSource(page, qaDriveFile);

  const remove = page.getByRole('button', { name: `Quitar ${qaDriveFile.name}` });
  await expect(remove).toBeVisible();
  const bounds = await measureComposer(page);
  expect(bounds.inputWidth).toBeGreaterThan(bounds.shellWidth * 0.75);
  expect(bounds.toolbarTop).toBeGreaterThanOrEqual(bounds.inputBottom);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
  await expect(input).toHaveValue(note);

  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(input).toHaveValue(note);
  await assertNoHorizontalOverflow(page);
});

test('review fixes: composer keeps caret, selection and draft through a pane reflow', async ({
  page,
}) => {
  await installQaRoutes(page, { driveEnabled: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/a/${threadId}`);
  const input = page.getByRole('textbox', { name: 'Nota clínica' });
  const note =
    'Primera línea clínica del borrador.\nSegunda línea clínica del borrador.\nTercera línea clínica del borrador.';
  await input.fill(note);

  await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
  const separator = page.getByRole('separator', { name: 'Redimensionar Google Drive' });
  await expect(separator).toBeVisible();
  await input.evaluate((element) => {
    element.focus();
    element.setSelectionRange(4, 31);
    (element as HTMLElement).dataset.qaReflowMarker = 'kept';
  });
  const writeRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/clinical-threads/')) {
      writeRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const handle = await separator.boundingBox();
  if (!handle) throw new Error('No se encontró divisor de Drive');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 500, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(input).toHaveValue(note);
  expect(
    await input.evaluate((element) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
    })),
  ).toEqual({ start: 4, end: 31 });
  expect(await input.evaluate((element) => (element as HTMLElement).dataset.qaReflowMarker)).toBe(
    'kept',
  );
  expect(writeRequests).toEqual([]);
  await assertNoHorizontalOverflow(page);
});

test.describe('c1 composer voice-state verification', () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    test(`keeps writing geometry and controls in each voice state at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await installQaRoutes(page);
      const media = await installVoiceMediaMock(page);
      const transcription = await holdTranscription(page);
      await page.setViewportSize(viewport);
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      const seed = 'Nota clínica base para dictado.';
      await input.fill(seed);

      const evidence: Array<Record<string, unknown>> = [];
      const record = async (state: string) => {
        const bounds = await measureComposer(page);
        expect(bounds.inputWidth).toBeGreaterThanOrEqual(Math.min(420, bounds.shellWidth * 0.9));
        expect(bounds.inputHeight).toBeLessThanOrEqual(144);
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
        expect(await input.inputValue()).toContain(seed);
        await assertNoHorizontalOverflow(page);
        evidence.push({
          state,
          shell: Math.round(bounds.shellWidth),
          input: `${Math.round(bounds.inputWidth)}x${Math.round(bounds.inputHeight)}`,
          toolbarRow: bounds.toolbarTop >= bounds.inputBottom ? 'below' : 'shared',
          controls: await page
            .locator('.clinical-composer-toolbar button')
            .evaluateAll((nodes) =>
              nodes.map((node) => node.getAttribute('aria-label') ?? node.textContent?.trim()),
            ),
        });
      };

      await record('idle');

      await media.setMode('pending');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.getByText('Solicitando acceso al micrófono…')).toBeVisible();
      await record('requesting_permission');
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();

      await media.setMode('grant');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.getByText('Grabando')).toBeVisible();
      await input.pressSequentially(' Texto tecleado mientras graba.');
      await record('recording');
      await page.setViewportSize({ width: viewport.width - 30, height: viewport.height });
      await expect(page.getByText('Grabando')).toBeVisible();
      await record('recording-reflow');

      await page.getByRole('button', { name: 'Detener grabación' }).click();
      await expect(page.getByText('Finalizando grabación…')).toBeVisible();
      await record('stopping');

      await media.releaseRecorder();
      await expect(page.getByText('Transcribiendo dictado…')).toBeVisible();
      await expect(input).toHaveAttribute('aria-busy', 'true');
      await record('transcribing');

      transcription.release();
      await expect(page.getByText('Dictado añadido')).toBeVisible();
      await expect(input).toHaveValue(/Texto dictado QA\./);
      await record('success');
      await expect(page.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();

      await media.setMode('deny');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.locator('.voice-composer-status[role="alert"]')).toContainText(
        'El navegador no permitió usar el micrófono.',
      );
      await record('error');
      await page.getByRole('button', { name: 'Descartar' }).click();
      await expect(page.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();

      await media.setMode('grant');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.getByText('Grabando')).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar dictado' }).click();
      await expect(page.getByRole('button', { name: 'Iniciar dictado' })).toBeVisible();
      await record('cancelled');
      await expect(input).toHaveValue(/Texto dictado QA\./);

      console.log(
        `[C1-VOICE] ${JSON.stringify({
          viewport: `${viewport.width}x${viewport.height}`,
          reflowWidth: viewport.width - 30,
          evidence,
        })}`,
      );
    });
  }
});

test.describe('coarse pointer clinical composer', () => {
  test.use({ hasTouch: true });

  test('keeps narrow composer controls at the 44px coarse target contract', async ({ page }) => {
    const controls = await installQaRoutes(page, { holdClinicalStream: true });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      await page.getByRole('textbox', { name: 'Nota clínica' }).fill('Nota clínica táctil.');
      expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);

      for (const name of ['Iniciar dictado', 'Enviar mensaje']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
      }

      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      const stop = page.getByRole('button', { name: 'Detener respuesta' });
      await expect(stop).toBeVisible();
      const stopBox = await stop.boundingBox();
      expect(stopBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(stopBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      await assertNoHorizontalOverflow(page);
    } finally {
      controls.releaseHeldStream();
    }
  });

  test('keeps the contextual Sheet close target at the 44px coarse contract', async ({ page }) => {
    await installQaRoutes(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/patients/${patientId}`);
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    const close = page
      .getByRole('dialog', { name: 'Asistente clínico' })
      .getByRole('button', { name: 'Cerrar' });
    const box = await close.boundingBox();
    if (!box) throw new Error('No se encontró el control de cierre del Sheet');
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await assertNoHorizontalOverflow(page);
  });

  test('keeps the queued removal control at the 44px coarse contract', async ({ page }) => {
    const controls = await installQaRoutes(page, { holdClinicalStream: true });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      const composer = page.getByRole('textbox', { name: 'Nota clínica' });
      await composer.fill('Respuesta táctil');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      await composer.fill('Pendiente táctil');
      await page.getByRole('button', { name: 'Encolar' }).click();
      const remove = page.getByRole('button', {
        name: 'Quitar mensaje 1 de la cola: Pendiente táctil',
      });
      const box = await remove.boundingBox();
      if (!box) throw new Error('No se encontró el control Quitar de la cola');
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await assertNoHorizontalOverflow(page);
      console.log('[QUEUE-001-TOUCH]', JSON.stringify({ width: box.width, height: box.height }));
    } finally {
      controls.releaseHeldStream();
    }
  });
});

test('review fixes: full assistant preserves snapshots and a continuous artifact heading outline', async ({
  page,
}) => {
  await installQaRoutes(page, { driveEnabled: true });
  await page.goto(`/a/${threadId}`);
  await expect(page.getByRole('heading', { name: 'Prepara una evolución clínica' })).toBeVisible();
  await captureView(page, 'qa-clinical-empty');
  await page.getByRole('textbox', { name: 'Nota clínica' }).fill('Nota clínica QA.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  const transcript = page.getByRole('log', { name: 'Transcripción clínica' });
  await expect(
    transcript.getByRole('heading', { name: 'Evolución clínica', level: 2 }),
  ).toBeVisible();
  const levels = await transcript
    .locator('h2, h3, h4')
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
  expect(levels).toEqual([2, 2, 3, 3, 3, 3, 3]);
});

test('review fixes: manual evolution keeps its parent-relative heading outline', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.goto(`/patients/${patientId}/evolutions/new`);
  await expect(
    page.getByRole('heading', { name: 'Nueva evolución dental', level: 1 }),
  ).toBeVisible();
  await page.getByLabel('Nota clínica').fill('Control preventivo QA.');
  await page.getByRole('button', { name: 'Generar borrador con IA' }).click();
  await expect(page.getByRole('heading', { name: 'Borrador generado', level: 2 })).toBeVisible();
  const review = page.locator('.evolution-review-artifact');
  await expect(
    review.getByRole('heading', { name: 'Borrador para revisar', level: 3 }),
  ).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Seguimiento', level: 4 })).toBeVisible();
});

test('review fixes: consulted evolutions with a coincident timestamp stay distinguishable', async ({
  page,
}) => {
  const coincidentAt = '2026-10-10T12:00:00Z';
  const differentAt = '2026-10-11T09:15:00Z';
  const evolutionIds = ['evolution-a', 'evolution-b', 'evolution-c'];
  await installQaRoutes(page, {
    clinicalMessages: [
      {
        id: 'assistant-evolutions',
        thread_id: threadId,
        turn_id: 'turn-evolutions',
        role: 'assistant',
        content: 'Estas son las evoluciones consultadas.',
        clinical_result: {
          result_kind: 'evolution_list',
          payload: {
            patient_id: patientId,
            evolutions: [
              { id: evolutionIds[0], evolution_at: coincidentAt },
              { id: evolutionIds[1], evolution_at: coincidentAt },
              { id: evolutionIds[2], evolution_at: differentAt },
            ],
          },
        },
        created_at: coincidentAt,
      },
    ],
  });
  let apiRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests += 1;
  });
  await page.goto(`/a/${threadId}`);
  const transcript = page.getByRole('log', { name: 'Transcripción clínica' });
  const links = transcript.getByRole('link');
  await expect(links).toHaveCount(3);
  const names = await links.evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() ?? ''),
  );
  expect(new Set(names).size).toBe(3);
  expect(names[0]).toMatch(/^Ver evolución 1 del /);
  expect(names[1]).toMatch(/^Ver evolución 2 del /);
  expect(names[0].replace('Ver evolución 1 del ', '')).toBe(
    names[1].replace('Ver evolución 2 del ', ''),
  );
  expect(names[2]).toMatch(/^Ver evolución del /);
  for (const [index, evolutionId] of evolutionIds.entries()) {
    await expect(links.nth(index)).toHaveAttribute(
      'href',
      `/patients/${patientId}/evolutions/${evolutionId}`,
    );
  }
  const requestsAfterLoad = apiRequests;
  await links.nth(0).focus();
  await expect(links.nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links.nth(2)).toBeFocused();
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(links.nth(0)).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).toBe(true);
  await expect(links.nth(0)).toBeVisible();
  const zoom = await page.context().newCDPSession(page);
  // Model 200% desktop zoom: half-sized CSS viewport with doubled pixel density.
  await zoom.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 450,
    deviceScaleFactor: 2,
    mobile: false,
  });
  expect(await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio }))).toEqual({
    width: 720,
    density: 2,
  });
  await expect(links.nth(0)).toBeVisible();
  await assertNoHorizontalOverflow(page);
  expect(apiRequests).toBe(requestsAfterLoad);
  console.log('[PMAX-001]', JSON.stringify({ names, apiRequests, requestsAfterLoad }));
});

test('review fixes: contextual shell keeps one Asistente clínico title with a subordinate empty heading', async ({
  page,
}) => {
  await installQaRoutes(page, { clinicalThreadTitle: 'Asistente clínico' });
  const mutations = trackQaApiMutations(page);
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/patients/${patientId}`);
    const trigger = page.getByRole('button', { name: 'Asistente', exact: true });
    await trigger.click();
    const panel =
      viewport.width < 1024
        ? page.getByRole('dialog', { name: 'Asistente clínico' })
        : page.getByRole('complementary', { name: 'Asistente del paciente' });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'Asistente clínico', exact: true }),
    ).toHaveCount(1);
    await expect(
      panel.getByRole('heading', { name: 'Prepara una evolución clínica', level: 3 }),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Cambiar paciente activo' })).toContainText(
      'Ana Pérez',
    );
    await expect(panel.getByRole('button', { name: /^Cerrar/ })).toHaveCount(1);
    const note = `Borrador contextual ${viewport.width}.`;
    await panel.getByRole('textbox', { name: 'Nota clínica' }).fill(note);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('textbox', { name: 'Nota clínica' })).toHaveValue(note);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    console.log(`[SHADCN-002] ${viewport.width}`, JSON.stringify({ note }));
  }
  expect(
    mutations.filter((mutation) => mutation.path !== '/api/clinical-threads/open-context'),
  ).toEqual([]);
});

test('review fixes: full assistant keeps its h1 and empty-state h2 with the default title', async ({
  page,
}) => {
  await installQaRoutes(page, { clinicalThreadTitle: 'Asistente clínico' });
  await page.goto(`/a/${threadId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Asistente clínico' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Prepara una evolución clínica', level: 2 }),
  ).toBeVisible();
});

test('audit fixes: primary action states keep readable contrast and visible focus', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.goto('/patients');
  const action = page.getByRole('button', { name: 'Nuevo paciente' });
  for (const state of ['normal', 'hover', 'focus']) {
    if (state === 'hover') await action.hover();
    if (state === 'focus') {
      await page.mouse.move(0, 0);
      await action.focus();
    }
    const colors = await action.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, outline: style.outlineWidth };
    });
    const luminance = (color: string): number => {
      const channels = color
        .match(/\d+/g)!
        .slice(0, 3)
        .map((channel) => {
          const value = Number(channel) / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(colors.color);
    const background = luminance(colors.background);
    expect(
      (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    if (state === 'focus') expect(colors.outline).toBe('2px');
  }
});

test('audit fixes: citation traps focus, restores trigger and keeps a 44px close target', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.route(`**/api/conversations/${conversationId}`, (route) =>
    route.fulfill(
      json({
        ...conversation,
        messages: [
          {
            ...conversation.messages[0],
            sources: [
              {
                chunk_id: 'citation-qa',
                video_id: videoId,
                video_title:
                  'Una cita con título largo para comprobar el reflujo en pantalla estrecha',
                video_url: video.url,
                start_seconds: 12,
                end_seconds: 18,
                snippet: 'Extracto QA',
              },
            ],
          },
        ],
      }),
    ),
  );
  await page.route('https://www.youtube.com/embed/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<button>Reproducir</button>',
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/c/${conversationId}`);
  const trigger = page.locator('.citation-chip');
  await page.getByRole('button', { name: 'Expandir fuentes' }).click();
  await trigger.click();
  const close = page.getByRole('button', { name: 'Cerrar cita' });
  await expect(close).toBeFocused();
  const box = await close.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Abrir en YouTube' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: 'Reproducir' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Abrir en YouTube' })).toBeFocused();
  await assertNoHorizontalOverflow(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('audit fixes: review link focuses its pending artifact and composer still autosizes', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(`/a/${threadId}`);
  const composer = page.getByLabel('Nota clínica');
  await composer.fill('Primera línea\nSegunda línea\nTercera línea');
  const height = await composer.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeGreaterThan(24);
  expect(
    await composer.evaluate((element) => getComputedStyle(element).transitionProperty),
  ).not.toContain('height');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await page.getByRole('button', { name: 'Revisar y guardar' }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeHidden();
  // Visible at the follow position: the duplicate dock action is absent.
  await expect(page.getByRole('button', { name: 'Ver borrador pendiente' })).toHaveCount(0);
  // Scrolled away: the dock retains the recovery link that focuses the exact artifact.
  await page.locator('.clinical-transcript').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole('button', { name: 'Ver borrador pendiente' }).click();
  await expect(page.locator('[data-artifact-id="draft-qa"]')).toBeFocused();
});

test('review fixes: long full transcript recovers a failed read, an uncertain save and an offscreen review', async ({
  page,
}) => {
  // StrictMode double-invokes the thread effect in the dev server, as with conversationLoadFailures.
  await installQaRoutes(page, { clinicalThreadLoadFailures: 2, clinicalResolveFailures: 1 });
  const mutations = trackQaApiMutations(page);
  const threadReads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes(`/api/clinical-threads/${threadId}`)) {
      threadReads.push(request.url());
    }
  });
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(`/a/${threadId}`);

  // Failed first read: dedicated feedback and a same-thread retry that issues reads only.
  await expect(
    page.getByRole('alert').filter({ hasText: 'No pudimos cargar este hilo clínico.' }),
  ).toBeVisible();
  const retryBaseline = mutations.length;
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.getByRole('heading', { name: 'Prepara una evolución clínica' })).toBeVisible();
  const retryWrites = mutations.slice(retryBaseline);
  expect(retryWrites).toEqual([]);

  // Prepare the review, then prove recovery from the dock while the destination is offscreen.
  const transcript = page.locator('.clinical-transcript');
  await page
    .getByLabel('Nota clínica')
    .fill('Nota de flujo combinado que queda fuera de la ventana del transcript.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await page.getByRole('button', { name: 'Revisar y guardar' }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ver borrador pendiente' })).toHaveCount(0);
  const dockBaseline = mutations.length;
  await transcript.evaluate((element) => {
    element.scrollTop = 0;
  });
  const dock = page.getByRole('button', { name: 'Ver borrador pendiente' });
  await expect(dock).toBeVisible();
  await dock.click();
  await expect(page.locator('[data-artifact-id="draft-qa"]')).toBeFocused();
  const dockWrites = mutations.slice(dockBaseline);
  expect(dockWrites).toEqual([]);

  // Uncertain save: the transport fails while the canonical action stays pending, so retry stays at the dock.
  await page.getByRole('button', { name: 'Confirmar guardado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar evolución' });
  const saveBaseline = mutations.length;
  const readsBaseline = threadReads.length;
  await dialog.getByRole('button', { name: 'Guardar evolución' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No pudimos guardar la evolución.' }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const uncertainEffects = mutations
    .slice(saveBaseline)
    .map((mutation) => `${mutation.method} ${mutation.path}`);
  expect(uncertainEffects).toEqual([
    'POST /api/clinical-actions/dddddddd-dddd-4ddd-8ddd-dddddddddddd/resolve',
  ]);
  const canonicalReads = threadReads.length - readsBaseline;
  expect(canonicalReads).toBe(1);

  // Retry reconciles to the canonical action and saves without duplicating preparation or writes.
  await page.getByRole('button', { name: 'Confirmar guardado' }).click();
  await page
    .getByRole('dialog', { name: 'Guardar evolución' })
    .getByRole('button', { name: 'Guardar evolución' })
    .click();
  await expect(page.getByRole('link', { name: /Ver en ficha/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const effects = mutations.map((mutation) => `${mutation.method} ${mutation.path}`);
  expect(effects.filter((entry) => entry.includes('/resolve'))).toHaveLength(2);
  expect(effects.filter((entry) => entry.includes('/prepare-save'))).toHaveLength(1);
  expect(effects.some((entry) => entry.includes('google-drive'))).toBe(false);
  console.log(
    '[C3-FULL]',
    JSON.stringify({
      retryWrites: retryWrites.length,
      dockWrites: dockWrites.length,
      uncertainEffects,
      canonicalReads,
      resolveWrites: 2,
      prepareWrites: 1,
    }),
  );
});

test('review fixes: contextual Sheet recovers a failed read and an offscreen review without writes', async ({
  page,
}) => {
  // The activation read plus StrictMode-mount reloads of the contextual panel all fail first.
  await installQaRoutes(page, { clinicalThreadLoadFailures: 3 });
  const mutations = trackQaApiMutations(page);
  await page.setViewportSize({ width: 768, height: 500 });
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Asistente clínico' });
  await expect(
    sheet.getByRole('alert').filter({ hasText: 'No pudimos cargar este hilo clínico.' }),
  ).toBeVisible();
  const retryBaseline = mutations.length;
  await sheet.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(sheet.getByRole('heading', { name: 'Prepara una evolución clínica' })).toBeVisible();
  expect(mutations.slice(retryBaseline)).toEqual([]);

  await sheet
    .getByLabel('Nota clínica')
    .fill('Nota contextual que queda fuera de la ventana del transcript.');
  await sheet.getByRole('button', { name: 'Enviar mensaje' }).click();
  await sheet.getByRole('button', { name: 'Revisar y guardar' }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();
  await page.keyboard.press('Escape');
  const dockBaseline = mutations.length;
  await sheet.locator('.clinical-transcript').evaluate((element) => {
    element.scrollTop = 0;
  });
  const dock = sheet.getByRole('button', { name: 'Ver borrador pendiente' });
  await expect(dock).toBeVisible();
  await dock.click();
  await expect(sheet.locator('[data-artifact-id="draft-qa"]')).toBeFocused();
  const dockWrites = mutations.slice(dockBaseline);
  expect(dockWrites).toEqual([]);
  await assertNoHorizontalOverflow(page);
  console.log('[C3-CONTEXTUAL]', JSON.stringify({ retryWrites: 0, dockWrites: dockWrites.length }));
});

test('audit fixes: code and copy survive deferred Prism failure', async ({ page }) => {
  await installQaRoutes(page);
  let hydrated = false;
  await page.route(`**/api/conversations/${conversationId}`, (route) => {
    hydrated = true;
    return route.fulfill(
      json({
        ...conversation,
        messages: [
          { ...conversation.messages[0], content: '```javascript\nconst answer = 42;\n```' },
        ],
      }),
    );
  });
  let attempts = 0;
  let deferredUrl = '';
  allowExpectedResourceFailure(page, 503);
  await page.route('**/assets/*.js', async (route) => {
    if (!hydrated || (deferredUrl && route.request().url() !== deferredUrl)) {
      await route.continue();
      return;
    }
    deferredUrl = route.request().url();
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, body: 'unavailable' });
    else await route.continue();
  });
  await page.goto(`/c/${conversationId}`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Resaltado no disponible' }),
  ).toBeVisible();
  await expect(page.locator('.code-block-wrapper code')).toHaveText('const answer = 42;');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('const answer = 42;');
  const diagnostics = qaRuntimeDiagnostics.get(page)!;
  const expectedFailure = diagnostics.errors.indexOf(`requestfailed: GET ${deferredUrl}`);
  expect(expectedFailure).toBeGreaterThanOrEqual(0);
  diagnostics.errors.splice(expectedFailure, 1);
  await page.reload();
  await expect(page.locator('.code-block-wrapper .token')).not.toHaveCount(0);
  await page.clock.runFor(100);
  await expect(page.locator('.code-block-wrapper code')).toHaveText('const answer = 42;');
  expect(attempts).toBe(2);
});

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
  const directory = options.patients ?? [patient];
  let patientChangeAttempts = 0;
  let loginAttempts = 0;
  let conversationLoadAttempts = 0;
  let currentConversation = { ...conversation, messages: [...conversation.messages] };
  let streamAttempts = 0;
  let clinicalStreamAttempts = 0;
  let clinicalThreadLoadAttempts = 0;
  let clinicalResolveAttempts = 0;
  const cancelledClinicalTurns = new Set<string>();
  let releaseHeldStream: (() => void) | null = null;
  let releaseHeldPatientChange: (() => void) | null = null;
  let resolvePatientChangeHeld: (() => void) | null = null;
  const patientChangeHeld = new Promise<void>((resolve) => {
    resolvePatientChangeHeld = resolve;
  });
  let resolveClinicalStreamEntered: (() => void) | null = null;
  const clinicalStreamEntered = new Promise<void>((resolve) => {
    resolveClinicalStreamEntered = resolve;
  });
  let currentClinicalThread: Record<string, unknown> = {
    ...clinicalThread,
    title: options.clinicalThreadTitle ?? clinicalThread.title,
    active_patient: options.clinicalPatient ?? clinicalThread.active_patient,
    messages: options.clinicalMessages ?? [],
    artifacts: [],
    actions: [],
  };
  let clinicalSummaries = options.clinicalThreadSummaries ?? null;

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
          drive_enabled: options.driveConfigured ?? options.driveEnabled ?? false,
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
        json((body.query ?? '').toLowerCase().includes('sin resultado') ? [] : directory),
      );
      return;
    }
    if (path === '/api/patients' && method === 'GET') {
      await route.fulfill(json(directory));
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
      await route.fulfill(json([currentConversation]));
      return;
    }
    if (path === '/api/conversations' && method === 'POST') {
      await route.fulfill(json(currentConversation));
      return;
    }
    if (path === '/api/conversations/acquire' && method === 'POST') {
      await route.fulfill(json({ conversation: currentConversation, reused: false }));
      return;
    }
    if (path === `/api/conversations/${conversationId}` && method === 'GET') {
      conversationLoadAttempts += 1;
      if (conversationLoadAttempts <= (options.conversationLoadFailures ?? 0)) {
        allowExpectedResourceFailure(page, 500);
        await route.fulfill(json({ detail: 'Error temporal de carga QA' }, 500));
        return;
      }
      await route.fulfill(json(currentConversation));
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
      if (options.persistChatStream) {
        currentConversation = {
          ...currentConversation,
          messages: [
            ...currentConversation.messages,
            {
              id: `assistant-stream-${streamAttempts}`,
              conversation_id: conversationId,
              role: 'assistant',
              content: 'Respuesta de streaming QA',
              created_at: '2026-01-15T12:00:01Z',
              sources: [],
            },
          ],
        };
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
        json(
          clinicalSummaries ?? [
            {
              id: threadId,
              title: currentClinicalThread.title,
              active_patient_id: patientId,
              active_turn_id: null,
              updated_at: currentClinicalThread.updated_at,
              preview: null,
              approval_pending: (currentClinicalThread.actions as unknown[]).length > 0,
            },
          ],
        ),
      );
      return;
    }
    if (path === '/api/clinical-threads/acquire' && method === 'POST') {
      await route.fulfill(json({ thread: currentClinicalThread, reused: false }, 201));
      return;
    }
    if (path === '/api/clinical-threads/open-context' && method === 'POST') {
      await route.fulfill(json({ resolution: 'reused', thread: currentClinicalThread }));
      return;
    }
    if (path === '/api/clinical-pending-work' && method === 'GET') {
      await route.fulfill(json({ items: [], total: 0, next_cursor: null }));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}` && method === 'GET') {
      clinicalThreadLoadAttempts += 1;
      if (clinicalThreadLoadAttempts <= (options.clinicalThreadLoadFailures ?? 0)) {
        allowExpectedResourceFailure(page, 500);
        await route.fulfill(json({ detail: 'No se pudo cargar el hilo clínico' }, 500));
        return;
      }
      await route.fulfill(json(currentClinicalThread));
      return;
    }
    if (
      method === 'GET' &&
      /^\/api\/clinical-threads\/[^/]+$/.test(path) &&
      path !== `/api/clinical-threads/${threadId}`
    ) {
      const id = path.split('/').pop() ?? threadId;
      await route.fulfill(json({ ...currentClinicalThread, id }));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/active-patient` && method === 'PATCH') {
      patientChangeAttempts += 1;
      if (patientChangeAttempts <= (options.patientChangeFailures ?? 0)) {
        allowExpectedResourceFailure(page, 500);
        await route.fulfill(json({ detail: 'No se pudo cambiar el paciente activo' }, 500));
        return;
      }
      const body = request.postDataJSON() as { patient_id?: string | null };
      if (options.holdPatientChange && releaseHeldPatientChange === null) {
        resolvePatientChangeHeld?.();
        await new Promise<void>((resolve) => {
          releaseHeldPatientChange = resolve;
        });
      }
      currentClinicalThread = {
        ...currentClinicalThread,
        active_patient: directory.find((candidate) => candidate.id === body.patient_id) ?? null,
      };
      await route.fulfill(json(currentClinicalThread));
      return;
    }
    if (method === 'PATCH' && /^\/api\/clinical-threads\/[^/]+$/.test(path)) {
      const id = path.split('/').pop() ?? '';
      const body = request.postDataJSON() as { title?: string };
      if (clinicalSummaries) {
        clinicalSummaries = clinicalSummaries.map((summary) =>
          summary.id === id ? { ...summary, title: body.title ?? summary.title } : summary,
        );
      }
      await route.fulfill(json({ ...currentClinicalThread, id, title: body.title ?? '' }));
      return;
    }
    if (method === 'DELETE' && /^\/api\/clinical-threads\/[^/]+$/.test(path)) {
      const id = path.split('/').pop() ?? '';
      if (clinicalSummaries) {
        clinicalSummaries = clinicalSummaries.filter((summary) => summary.id !== id);
      }
      // ponytail: 200+JSON instead of the API's 204; Playwright/Chromium reports a
      // fulfilled 204 as requestfailed net::ERR_ABORTED and the QA harness treats that as an error.
      await route.fulfill(json({ deleted: id }));
      return;
    }
    if (
      path.startsWith(`/api/clinical-threads/${threadId}/turns/`) &&
      path.endsWith('/cancel') &&
      method === 'POST'
    ) {
      const turn = path.split('/').at(-2) ?? '';
      cancelledClinicalTurns.add(turn);
      currentClinicalThread = {
        ...currentClinicalThread,
        active_turn_id: null,
        messages: (currentClinicalThread.messages as Array<Record<string, unknown>>).map(
          (message) =>
            message.turn_id === turn && message.role === 'user'
              ? { ...message, turn_status: 'failed', turn_error_code: 'CLINICAL_TURN_CANCELLED' }
              : message,
        ),
      };
      releaseHeldStream?.();
      await route.fulfill(json({ status: 'cancelled' }));
      return;
    }
    if (path === `/api/clinical-threads/${threadId}/turns` && method === 'POST') {
      clinicalStreamAttempts += 1;
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
      const completedClinicalThread = {
        ...currentClinicalThread,
        active_turn_id: null,
        messages: [
          ...messages,
          {
            id: `user-${turn}`,
            thread_id: threadId,
            turn_id: turn,
            role: 'user',
            content: body.content ?? '',
            turn_status: 'completed',
            created_at: '2026-01-15T12:00:58Z',
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
        clinicalEvent('turn.completed', 3, 'turn-complete', 'turn', {}, turn),
      ].join('');
      if (options.holdClinicalStream && clinicalStreamAttempts === 1) {
        currentClinicalThread = {
          ...currentClinicalThread,
          active_turn_id: turn,
          messages: [
            ...messages,
            {
              id: `user-${turn}`,
              thread_id: threadId,
              turn_id: turn,
              role: 'user',
              content: body.content ?? '',
              turn_status: 'running',
              created_at: '2026-01-15T12:00:58Z',
            },
          ],
        };
        await new Promise<void>((resolve) => {
          releaseHeldStream = resolve;
          resolveClinicalStreamEntered?.();
        });
      }
      if (!cancelledClinicalTurns.has(turn)) currentClinicalThread = completedClinicalThread;
      try {
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: payload });
      } catch {
        // The browser may have left before the detached worker completed.
      }
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
        artifacts: (currentClinicalThread.artifacts as Array<Record<string, unknown>>).map(
          (artifact) =>
            artifact.id === 'draft-qa' ? { ...artifact, status: 'pending' } : artifact,
        ),
        actions: [...(currentClinicalThread.actions as Array<Record<string, unknown>>), action],
      };
      await route.fulfill(json(action));
      return;
    }
    if (
      path === '/api/clinical-actions/dddddddd-dddd-4ddd-8ddd-dddddddddddd/resolve' &&
      method === 'POST'
    ) {
      clinicalResolveAttempts += 1;
      if (clinicalResolveAttempts <= (options.clinicalResolveFailures ?? 0)) {
        allowExpectedResourceFailure(page, 502);
        await route.fulfill(json({ detail: 'No se pudo confirmar el guardado' }, 502));
        return;
      }
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
        artifacts: (currentClinicalThread.artifacts as Array<Record<string, unknown>>).map(
          (artifact) =>
            artifact.id === 'draft-qa' ? { ...artifact, status: 'approved' } : artifact,
        ),
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
      const fileId = decodeURIComponent(path.slice('/api/google-drive/files/'.length));
      const driveFile = options.driveFiles?.find((candidate) => candidate.id === fileId);
      if (method === 'GET' && driveFile) {
        const { content, ...metadata } = driveFile;
        await route.fulfill(json({ ...metadata, content }));
        return;
      }
      await route.fulfill(
        json({
          files: (options.driveFiles ?? []).map(({ content: _content, ...metadata }) => metadata),
          next_page_token: null,
        }),
      );
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
    releaseHeldPatientChange: () => releaseHeldPatientChange?.(),
    patientChangeHeld,
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

async function measureComposer(page: Page): Promise<{
  shellWidth: number;
  inputWidth: number;
  inputHeight: number;
  inputBottom: number;
  toolbarTop: number;
  scrollWidth: number;
  clientWidth: number;
}> {
  const composer = page.getByTestId('clinical-composer');
  await expect(composer).toBeVisible();
  return composer.evaluate((node) => {
    const shell = node.getBoundingClientRect();
    const input = node.querySelector('textarea')!.getBoundingClientRect();
    const toolbar = node.querySelector('.clinical-composer-toolbar')!.getBoundingClientRect();
    return {
      shellWidth: shell.width,
      inputWidth: input.width,
      inputHeight: input.height,
      inputBottom: input.bottom,
      toolbarTop: toolbar.top,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    };
  });
}

const composerMatrixViewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

async function attachQaSource(page: Page, file: QaDriveFile): Promise<void> {
  await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
  const back = page.getByRole('button', { name: 'Volver', exact: true });
  if (await back.isVisible().catch(() => false)) await back.click();
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: `Abrir ${file.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Adjuntar documento al mensaje' }).click();
  await expect(page.getByRole('button', { name: `Quitar ${file.name}` })).toBeVisible();
}

interface QaVoiceControls {
  setMode: (mode: 'pending' | 'grant' | 'deny') => Promise<void>;
  releaseRecorder: () => Promise<void>;
}

interface QaVoiceWindow {
  __qaVoice: {
    mode: string;
    setMode: (mode: string) => void;
    release: () => void;
  };
}

async function installVoiceMediaMock(page: Page): Promise<QaVoiceControls> {
  await page.addInitScript(() => {
    const voice = {
      mode: 'grant',
      recorder: null as null | { __release?: () => void },
      setMode(next: string) {
        voice.mode = next;
      },
      release() {
        const recorder = voice.recorder;
        voice.recorder = null;
        recorder?.__release?.();
      },
    };
    Object.defineProperty(window, '__qaVoice', { value: voice, configurable: true });
    const track = () => ({ kind: 'audio', enabled: true, stop() {}, onended: null });
    class QaMediaRecorder {
      state: 'inactive' | 'recording' = 'inactive';
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? 'audio/webm';
        voice.recorder = this as unknown as { __release?: () => void };
      }
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        voice.recorder = this as unknown as { __release?: () => void };
        (this as unknown as { __release?: () => void }).__release = () => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }),
          });
          this.onstop?.();
        };
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: QaMediaRecorder, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          const current = (window as unknown as QaVoiceWindow).__qaVoice;
          if (current.mode === 'pending') return new Promise(() => {});
          if (current.mode === 'deny') {
            return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
          }
          return Promise.resolve({ getTracks: () => [track()] });
        },
      },
    });
  });
  return {
    setMode: (mode) =>
      page.evaluate((next) => (window as unknown as QaVoiceWindow).__qaVoice.setMode(next), mode),
    releaseRecorder: () =>
      page.evaluate(() => (window as unknown as QaVoiceWindow).__qaVoice.release()),
  };
}

async function holdTranscription(page: Page): Promise<{ release: () => void }> {
  let release: (() => void) | null = null;
  await page.route('**/api/transcriptions', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill(json({ text: 'Texto dictado QA.' }));
  });
  return { release: () => release?.() };
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

test('patient polish keeps mobile navigation clear and header actions aligned', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.route('**/api/clinical-pending-work?**', (route) =>
    route.fulfill(json({ items: [], total: 0, next_cursor: null })),
  );
  await page.goto(`/patients/${patientId}`);
  await expect(page.getByRole('heading', { name: 'Ana Pérez', exact: true })).toBeVisible();
  await expect(page.getByText('Exportaciones Drive fallidas', { exact: true })).toBeVisible();
  for (const width of [320, 375, 390, 1440]) {
    await page.setViewportSize({ width, height: 600 });
    await assertNoHorizontalOverflow(page);
    const actions = page.locator('.patient-header-actions');
    for (const action of await actions.locator('button, a').all()) {
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if (width >= 768) continue;
    const main = page.locator('#main-content > main');
    const navigation = page.getByRole('button', { name: 'Abrir navegación', exact: true });
    await main.evaluate((element) => {
      element.scrollTop = 36;
    });
    const mainBox = (await main.boundingBox())!;
    const navigationBox = (await navigation.boundingBox())!;
    expect(mainBox.y).toBeGreaterThanOrEqual(navigationBox.y + navigationBox.height);
    const primary = (await actions.getByRole('link', { name: /Nueva evolución/ }).boundingBox())!;
    const edit = (await actions.getByRole('button', { name: 'Editar paciente' }).boundingBox())!;
    const assistant = (await actions
      .getByRole('button', { name: 'Asistente', exact: true })
      .boundingBox())!;
    expect(edit.y).toBeCloseTo(assistant.y, 0);
    expect(primary.y + primary.height).toBeLessThanOrEqual(edit.y);
    expect(primary.width).toBeGreaterThan(edit.width);
    const tabs = page.getByRole('tablist', { name: 'Secciones del paciente' });
    const summary = (await tabs.getByRole('tab', { name: 'Resumen', exact: true }).boundingBox())!;
    const info = (await tabs.getByRole('tab', { name: 'Información', exact: true }).boundingBox())!;
    const activity = (await tabs
      .getByRole('tab', { name: 'Actividad', exact: true })
      .boundingBox())!;
    expect(summary.y).toBeCloseTo(info.y, 0);
    expect(summary.width).toBeCloseTo(info.width, 0);
    expect(activity.y).toBeGreaterThan(summary.y);
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
  }
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

test('clinical login remains readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installQaRoutes(page, { authenticated: false });
  await page.goto('/login');
  await expect(page.getByText('Tu espacio clínico, con el paciente en contexto.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot('qa-login-mobile.png', {
    animations: 'disabled',
    maxDiffPixels: 20,
  });
});

test('patients, patient detail, and new evolution preserve dialog contracts', async ({ page }) => {
  await installQaRoutes(page);
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ana Pérez/ })).toBeVisible();
  await captureView(page, 'qa-patients');

  await page
    .getByRole('textbox', { name: 'Buscar por nombre, teléfono o RUT' })
    .fill('sin resultado');
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
  await expect(
    page.getByRole('heading', { name: 'Nueva evolución dental', level: 1 }),
  ).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Borrador generado', level: 2 })).toBeVisible();
  await captureView(page, 'qa-new-evolution-review');

  const review = page.locator('.evolution-review-artifact');
  await expect(
    review.getByRole('heading', { name: 'Borrador para revisar', level: 3 }),
  ).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Seguimiento', level: 4 })).toBeVisible();
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

test('chat stream completes after SPA navigation and reconciles on return', async ({ page }) => {
  const controls = await installQaRoutes(page, { holdFirstStream: true, persistChatStream: true });
  try {
    await page.goto(`/c/${conversationId}`);
    await page.getByLabel('Pregunta sobre la biblioteca de videos').fill('Pregunta pendiente QA');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByRole('button', { name: 'Detener respuesta' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Pacientes' })
      .click();
    controls.releaseHeldStream();
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Chat' })
      .click();
    await page.getByRole('button', { name: 'Conversación QA', exact: true }).click();
    await expect(page.getByText('Respuesta de streaming QA')).toHaveCount(1);
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
      .or(page.getByRole('heading', { name: 'Prepara una evolución clínica' })),
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
  await expect(page.getByText('Preparé un borrador para revisión.')).toHaveCount(0);
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  await expect(page.locator('.clinical-artifact-metadata time')).toHaveText(
    '15 ene 2026 · 12:01',
  );
  const reviewOpener = page.getByRole('button', { name: 'Revisar y guardar' });
  await reviewOpener.click();
  await auditDialog(page, 'Guardar evolución');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeHidden();

  await page.goto(`/a/${threadId}`);
  const approvalOpener = page.getByRole('button', { name: 'Revisar y guardar' });
  await approvalOpener.click();
  await auditDialog(page, 'Guardar evolución');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeHidden();
  await expect(approvalOpener).toBeFocused();
  await approvalOpener.click();
  await auditDialog(page, 'Guardar evolución');
  await page
    .getByRole('dialog', { name: 'Guardar evolución' })
    .getByRole('button', { name: 'Volver a editar' })
    .click();
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
    await expect(page.getByText('Preparé un borrador para revisión.')).toHaveCount(0);
    await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(1);
  } finally {
    controls.releaseHeldStream();
  }
});

test('clinical workspace reflows during live resize without losing the composer', async ({
  page,
}) => {
  await installQaRoutes(page, { driveEnabled: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/a/${threadId}`);
  const composer = page.getByLabel('Nota clínica');
  await composer.fill('Borrador que sigue en el workspace.');
  const sidebar = page.locator('#app-sidebar');
  await sidebar.getByRole('button', { name: 'Colapsar navegación' }).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(0);
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(260);

  await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
  await expect(page.locator('.workspace-resizable')).not.toHaveClass(/is-toggling/);
  const main = page.locator('.workspace-panel-main');
  const separator = page.getByRole('separator', { name: 'Redimensionar Google Drive' });
  await expect(separator).toBeVisible();
  const initialWidth = (await main.boundingBox())?.width ?? 0;
  const handle = await separator.boundingBox();
  if (!handle) throw new Error('No se encontró divisor');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 400, handle.y + handle.height / 2, { steps: 8 });
  const draggedWidth = (await main.boundingBox())?.width ?? 0;
  expect(draggedWidth).toBeLessThan(initialWidth);
  expect(draggedWidth).toBeGreaterThanOrEqual(390);
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const saved = window.localStorage.getItem('dental.drive.workspace.layout.v1');
        return saved ? (JSON.parse(saved) as { accessory: number }).accessory : 0;
      }),
    )
    .toBeGreaterThan(40);
  const settledWidth = (await main.boundingBox())?.width ?? 0;
  await page.getByRole('button', { name: 'Cerrar Google Drive' }).click();
  await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
  await expect
    .poll(async () => Math.abs(((await main.boundingBox())?.width ?? 0) - settledWidth))
    .toBeLessThan(8);
  await expect(composer).toHaveValue('Borrador que sigue en el workspace.');
  await assertNoHorizontalOverflow(page);
});

test('clinical turn finishes after navigation and reconciles on return and reload', async ({
  page,
}) => {
  const controls = await installQaRoutes(page, { holdClinicalStream: true });
  try {
    await page.goto(`/a/${threadId}`);
    await page.getByLabel('Nota clínica').fill('Nota durante navegación QA.');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await controls.clinicalStreamEntered;
    await expect(page.getByRole('button', { name: 'Detener respuesta' })).toBeVisible();
    await page.getByLabel('Nota clínica').fill('Nota de seguimiento QA.');
    await expect(page.getByRole('button', { name: 'Encolar' })).toBeVisible();

    await page.goto('/patients');
    controls.releaseHeldStream();
    await page.goto(`/a/${threadId}`);
    await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(1);
    await expect(page.getByText('Preparé un borrador para revisión.')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(1);
  } finally {
    controls.releaseHeldStream();
  }
});

test('clinical Stop preserves the note and retry creates one artifact', async ({ page }) => {
  const controls = await installQaRoutes(page, { holdClinicalStream: true });
  try {
    await page.goto(`/a/${threadId}`);
    await page.getByLabel('Nota clínica').fill('Nota detenida QA.');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await controls.clinicalStreamEntered;
    await page.getByRole('button', { name: 'Detener respuesta' }).click();
    await expect(
      page.getByText('Respuesta detenida. Tu nota se conserva y puedes reintentar.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(1);
    await page.setViewportSize({ width: 768, height: 900 });
    await assertNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
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

function qaPendingDriveRow(
  id: string,
  evolutionId: string,
  owner: typeof patient,
): PendingWorkItem {
  return {
    id,
    kind: 'drive_export_failed',
    patient: {
      id: owner.id,
      display_name: `${owner.first_name} ${owner.last_name}`,
      rut_masked: owner.rut_masked,
    },
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'retry_drive_export', evolution_id: evolutionId, thread_id: threadId },
  };
}

function qaPendingDraftRow(id: string, owner: typeof patient): PendingWorkItem {
  return {
    id,
    kind: 'recoverable_draft',
    patient: {
      id: owner.id,
      display_name: `${owner.first_name} ${owner.last_name}`,
      rut_masked: owner.rut_masked,
    },
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'continue_draft', artifact_id: `artifact-${id}`, thread_id: threadId },
    summary: `Borrador ${id}`,
  };
}

interface QaPendingWindowFixture {
  firstPage: () => PendingWorkItem[];
  secondPage: () => PendingWorkItem[];
  /** Fresh later-page reads fail after the retry. */
  failSecondPage?: () => boolean;
  /** POST status for the export retry. */
  retryStatus?: () => number;
  onRetry?: () => void;
}

/** Serves a two-page pending window and records the read/retry request sequence. */
async function installPendingWindow(
  page: Page,
  fixture: QaPendingWindowFixture,
): Promise<string[]> {
  const requests: string[] = [];
  await page.route('**/api/clinical-pending-work**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    requests.push(cursor ? `read:${cursor}` : 'read:first');
    if (cursor && fixture.failSecondPage?.()) {
      allowExpectedResourceFailure(page, 500);
      await route.fulfill(json({ detail: 'No disponible' }, 500));
      return;
    }
    const items = cursor ? fixture.secondPage() : fixture.firstPage();
    await route.fulfill(
      json({ items, total: items.length, next_cursor: cursor ? null : 'cursor-1' }),
    );
  });
  await page.route('**/api/clinical/evolutions/*/drive-export/retry', async (route) => {
    requests.push('retry');
    const status = fixture.retryStatus?.() ?? 200;
    if (status !== 200) allowExpectedResourceFailure(page, status);
    fixture.onRetry?.();
    await route.fulfill(json({ drive_export: { status: 'synced' } }, status));
  });
  return requests;
}

test('pending window retries a later-page export and keeps focus on a usable action', async ({
  page,
}) => {
  await installQaRoutes(page);
  const firstPage = [qaPendingDriveRow('drive:a', 'ev-a', patient)];
  let secondPage = [qaPendingDriveRow('drive:b', 'ev-b', patientB)];
  const requests = await installPendingWindow(page, {
    firstPage: () => firstPage,
    secondPage: () => secondPage,
    onRetry: () => {
      secondPage = [];
    },
  });
  await page.goto('/assistant?view=pending');
  await expect(page.getByRole('heading', { name: 'Ana Pérez' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver más pendientes' }).click();
  await expect(page.getByRole('heading', { name: 'Bruno Ríos' })).toBeVisible();

  await page
    .locator('article')
    .filter({ hasText: 'Bruno Ríos' })
    .getByRole('button', { name: 'Reintentar' })
    .click();

  await expect(page.getByRole('heading', { name: 'Bruno Ríos' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ana Pérez' })).toBeVisible();
  await expect(
    page
      .locator('article')
      .filter({ hasText: 'Ana Pérez' })
      .getByRole('link', { name: 'Ver evolución' }),
  ).toBeFocused();
  await expect(page.getByRole('status')).toHaveText('Se actualizó el trabajo pendiente.');
  await expect(page.getByRole('button', { name: 'Ver más pendientes' })).toHaveCount(0);
  expect(requests).toEqual(['read:first', 'read:cursor-1', 'retry', 'read:first', 'read:cursor-1']);
});

test('pending window keeps a failed export row anchored while it reconciles the window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await installQaRoutes(page);
  const fillers = Array.from({ length: 8 }, (_, index) =>
    qaPendingDraftRow(`draft-${index}`, patient),
  );
  let firstPage = [...fillers];
  const secondPage = [qaPendingDriveRow('drive:b', 'ev-b', patientB)];
  const requests = await installPendingWindow(page, {
    firstPage: () => firstPage,
    secondPage: () => secondPage,
    retryStatus: () => 502,
    onRetry: () => {
      firstPage = [qaPendingDraftRow('draft-new', patient), ...firstPage];
    },
  });
  await page.goto('/assistant?view=pending');
  await expect(page.getByRole('heading', { name: 'Ana Pérez' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Ver más pendientes' }).click();
  const bruno = page.locator('article').filter({ hasText: 'Bruno Ríos' });
  await expect(bruno).toBeVisible();

  const retryButton = bruno.getByRole('button', { name: 'Reintentar' });
  await retryButton.scrollIntoViewIfNeeded();
  const scroller = page.locator('main.clinical-assistant-area.overflow-y-auto');
  const before = (await bruno.boundingBox())!;
  const scrollBefore = await scroller.evaluate((element) => element.scrollTop);
  await retryButton.click();

  await expect(page.getByRole('alert')).toHaveText(
    'No pudimos reintentar la sincronización. La evolución sigue guardada en ficha.',
  );
  await expect(page.locator('article')).toHaveCount(10);
  const after = (await bruno.boundingBox())!;
  const scrollAfter = await scroller.evaluate((element) => element.scrollTop);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
  await expect(retryButton).toBeFocused();
  expect(requests).toEqual(['read:first', 'read:cursor-1', 'retry', 'read:first', 'read:cursor-1']);
});

test('pending window keeps the last complete window when a later refresh page fails', async ({
  page,
}) => {
  await installQaRoutes(page);
  let failSecondPage = false;
  const requests = await installPendingWindow(page, {
    firstPage: () => [qaPendingDriveRow('drive:a', 'ev-a', patient)],
    secondPage: () => [qaPendingDriveRow('drive:b', 'ev-b', patientB)],
    failSecondPage: () => failSecondPage,
    onRetry: () => {
      failSecondPage = true;
    },
  });
  await page.goto('/assistant?view=pending');
  await page.getByRole('button', { name: 'Ver más pendientes' }).click();
  const bruno = page.locator('article').filter({ hasText: 'Bruno Ríos' });
  await expect(bruno).toBeVisible();
  const retryButton = bruno.getByRole('button', { name: 'Reintentar' });
  await retryButton.click();

  await expect(page.getByRole('alert')).toContainText('No pudimos cargar tus pendientes.');
  await expect(page.getByText('No pudimos reintentar la sincronización')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ana Pérez' })).toBeVisible();
  await expect(bruno).toBeVisible();
  await expect(retryButton).toBeFocused();
  expect(requests).toEqual(['read:first', 'read:cursor-1', 'retry', 'read:first', 'read:cursor-1']);
});

test('pending reads for a previous patient scope cannot replace the current one', async ({
  page,
}) => {
  await installQaRoutes(page, { patients: [patient, patientB] });
  let releaseHeld: (() => void) | null = null;
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  let settledStale = 0;
  await page.route('**/api/clinical-pending-work**', async (route) => {
    const scope = new URL(route.request().url()).searchParams.get('patient_id');
    if (scope === patientId) {
      await held;
      settledStale += 1;
      await route.fulfill(json({ items: [], total: 99, next_cursor: null }));
      return;
    }
    await route.fulfill(json({ items: [], total: 7, next_cursor: null }));
  });
  await page.route(`**/api/patients/${patientBId}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill(json(path.endsWith('/evolutions') ? [] : patientB));
  });

  await page.goto(`/patients/${patientId}`);
  await expect(page.getByRole('region', { name: 'Resumen del paciente' })).toBeVisible();
  await page.locator('#main-content').getByRole('link', { name: 'Pacientes', exact: true }).click();
  await page.getByRole('link', { name: /Bruno Ríos/ }).click();
  const summary = page.getByRole('region', { name: 'Resumen del paciente' });
  await expect(summary.locator('dd[aria-live="polite"]')).toHaveText(['7', '7', '7']);

  releaseHeld?.();
  await expect.poll(() => settledStale).toBe(3);
  await expect(summary.locator('dd[aria-live="polite"]')).toHaveText(['7', '7', '7']);
});

function qaPendingApprovalRow(
  id: string,
  actionId: string,
  owner: typeof patient,
): PendingWorkItem {
  return {
    id,
    kind: 'approval_required',
    patient: {
      id: owner.id,
      display_name: `${owner.first_name} ${owner.last_name}`,
      rut_masked: owner.rut_masked,
    },
    updated_at: '2026-10-01T12:00:00Z',
    action: { kind: 'review_approval', action_id: actionId, thread_id: threadId },
    summary: `Revisión ${id}`,
  };
}

function qaThreadArtifact(
  id: string,
  status: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    owner_user_id: '55555555-5555-4555-8555-555555555555',
    thread_id: threadId,
    turn_id: 'turn-qa',
    patient_id: patientId,
    artifact_type: 'clinical_draft',
    status,
    source_note: 'Nota clínica QA.',
    generated_draft: draft,
    draft,
    evolution_at: '2026-10-01T12:00:00.123456Z',
    created_at: '2026-10-01T11:00:00.123456Z',
    updated_at: '2026-10-01T12:00:00.123456Z',
    ...overrides,
  };
}

interface QaDismissalFixture {
  pending: () => PendingWorkItem[];
  thread: () => Record<string, unknown>;
  discardStatus?: () => number;
  resolveStatus?: () => number;
  onDiscard?: (body: Record<string, unknown>) => void;
  onResolve?: (body: Record<string, unknown>) => void;
}

/** Serves the pending window plus the read-only thread, discard and decline commands. */
async function installQaDismissal(
  page: Page,
  fixture: QaDismissalFixture,
): Promise<{
  reads: Array<{ readOnly: boolean }>;
  posts: Array<{ path: 'discard' | 'resolve'; body: Record<string, unknown> }>;
}> {
  const reads: Array<{ readOnly: boolean }> = [];
  const posts: Array<{ path: 'discard' | 'resolve'; body: Record<string, unknown> }> = [];
  await page.route('**/api/clinical-pending-work**', async (route) => {
    const items = fixture.pending();
    await route.fulfill(json({ items, total: items.length, next_cursor: null }));
  });
  await page.route(`**/api/clinical-threads/${threadId}**`, async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname !== `/api/clinical-threads/${threadId}` ||
      route.request().method() !== 'GET'
    ) {
      await route.fallback();
      return;
    }
    reads.push({ readOnly: url.searchParams.get('read_only') === 'true' });
    await route.fulfill(json(fixture.thread()));
  });
  await page.route('**/api/clinical-threads/*/artifacts/*/discard', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push({ path: 'discard', body });
    fixture.onDiscard?.(body);
    const status = fixture.discardStatus?.() ?? 200;
    if (status !== 200) {
      allowExpectedResourceFailure(page, status);
      await route.fulfill(json({ detail: 'Error QA' }, status));
      return;
    }
    await route.fulfill(
      json({
        outcome: 'discarded',
        thread_id: threadId,
        patient_id: patientId,
        artifact_id: 'artifact-draft:a',
        artifact_status: 'discarded',
        operation_id: body.operation_id,
        discarded_by: '55555555-5555-4555-8555-555555555555',
        resolved_at: '2026-10-01T12:05:00.123456Z',
        expected_artifact_updated_at: body.expected_artifact_updated_at,
        updated_at: '2026-10-01T12:05:00.123456Z',
      }),
    );
  });
  await page.route('**/api/clinical-actions/*/resolve', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push({ path: 'resolve', body });
    fixture.onResolve?.(body);
    const status = fixture.resolveStatus?.() ?? 200;
    if (status !== 200) {
      allowExpectedResourceFailure(page, status);
      await route.fulfill(json({ detail: 'Error QA' }, status));
      return;
    }
    await route.fulfill(
      json({
        id: 'action-qa',
        thread_id: threadId,
        turn_id: 'turn-qa',
        artifact_id: 'artifact-review:a',
        patient_id: patientId,
        action_type: 'save_evolution',
        proposal_payload: null,
        proposal_hash: 'a'.repeat(64),
        status: 'declined',
        expires_at: '2026-10-01T13:00:00Z',
        created_at: '2026-10-01T12:00:00Z',
        resolved_at: '2026-10-01T12:05:00.123456Z',
        resolved_by: '55555555-5555-4555-8555-555555555555',
        result_resource_id: null,
      }),
    );
  });
  return { reads, posts };
}

test('pending dismissal confirms one draft discard with a canonical read, Escape cancellation and focus fallback', async ({
  page,
}) => {
  await installQaRoutes(page);
  let rows = [qaPendingDraftRow('draft:a', patient), qaPendingDraftRow('draft:b', patient)];
  const harness = await installQaDismissal(page, {
    pending: () => rows,
    thread: () => ({
      ...clinicalThread,
      artifacts: [
        qaThreadArtifact('artifact-draft:a', 'draft'),
        qaThreadArtifact('artifact-draft:b', 'draft'),
      ],
      actions: [],
    }),
    onDiscard: () => {
      rows = [qaPendingDraftRow('draft:b', patient)];
    },
  });
  await page.goto('/assistant?view=pending');
  await expect(page.getByText('Borrador draft:a')).toBeVisible();

  const first = page.locator('article').filter({ hasText: 'Borrador draft:a' });
  await first.getByRole('button', { name: 'Descartar' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Ana Pérez');
  await expect(dialog).toContainText('Dejará de estar disponible para revisión o continuación');
  await expect(dialog).toContainText('no se modifican');
  expect(harness.reads).toEqual([{ readOnly: true }]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(harness.posts).toHaveLength(0);

  await first.getByRole('button', { name: 'Descartar' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByText('Borrador draft:a')).toHaveCount(0);
  await expect(page.getByText('Borrador draft:b')).toBeVisible();
  expect(harness.posts).toHaveLength(1);
  expect(harness.posts[0].path).toBe('discard');
  expect(harness.posts[0].body).toMatchObject({
    expected_patient_id: patientId,
    expected_artifact_updated_at: '2026-10-01T12:00:00.123456Z',
  });
  expect(String(harness.posts[0].body.operation_id)).toMatch(/^[0-9a-f-]{36}$/);
  await expect(
    page
      .locator('article')
      .filter({ hasText: 'Borrador draft:b' })
      .getByRole('link', { name: 'Continuar' }),
  ).toBeFocused();
  expect(harness.reads).toEqual([{ readOnly: true }, { readOnly: true }]);
});

test('pending dismissal reconciles a lost response through the stored receipt without a second write', async ({
  page,
}) => {
  await installQaRoutes(page);
  let rows = [qaPendingDraftRow('draft:a', patient)];
  let operationId: string | null = null;
  let discarded = false;
  const harness = await installQaDismissal(page, {
    pending: () => rows,
    thread: () => ({
      ...clinicalThread,
      artifacts: [
        qaThreadArtifact(
          'artifact-draft:a',
          discarded ? 'discarded' : 'draft',
          operationId
            ? {
                discard_operation_id: operationId,
                discarded_by: '55555555-5555-4555-8555-555555555555',
                discard_expected_updated_at: '2026-10-01T12:00:00.123456Z',
                resolved_at: '2026-10-01T12:05:00.123456Z',
              }
            : {},
        ),
      ],
      actions: [],
    }),
    discardStatus: () => 500,
    onDiscard: (body) => {
      operationId = String(body.operation_id);
      discarded = true;
      rows = [];
    },
  });
  await page.goto('/assistant?view=pending');
  await page
    .locator('article')
    .filter({ hasText: 'Borrador draft:a' })
    .getByRole('button', { name: 'Descartar' })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByText('No pudimos confirmar si el descarte se completó.')).toBeVisible();
  expect(harness.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Verificar estado' }).click();
  await expect(page.getByText('Borrador draft:a')).toHaveCount(0);
  expect(harness.posts).toHaveLength(1);
  expect(harness.reads).toEqual([{ readOnly: true }, { readOnly: true }]);
});

test('pending approval decline sends the expected identity bundle and removes the row only after confirmation', async ({
  page,
}) => {
  await installQaRoutes(page);
  let rows = [qaPendingApprovalRow('review:a', 'action-qa', patient)];
  const harness = await installQaDismissal(page, {
    pending: () => rows,
    thread: () => ({
      ...clinicalThread,
      artifacts: [qaThreadArtifact('artifact-review:a', 'pending')],
      actions: [
        {
          id: 'action-qa',
          thread_id: threadId,
          turn_id: 'turn-qa',
          artifact_id: 'artifact-review:a',
          patient_id: patientId,
          action_type: 'save_evolution',
          proposal_payload: null,
          proposal_hash: 'a'.repeat(64),
          status: 'pending',
          expires_at: '2026-10-01T13:00:00Z',
          created_at: '2026-10-01T12:00:00Z',
          resolved_at: null,
          result_resource_id: null,
        },
      ],
    }),
    onResolve: () => {
      rows = [];
    },
  });
  await page.goto('/assistant?view=pending');
  const row = page.locator('article').filter({ hasText: 'Evolución lista para revisión' });
  await row.getByRole('button', { name: 'Descartar' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Ana Pérez');
  await expect(dialog).toContainText('Evolución lista para revisión');
  await dialog.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByText('Evolución lista para revisión')).toHaveCount(0);
  expect(harness.posts).toHaveLength(1);
  expect(harness.posts[0]).toMatchObject({
    path: 'resolve',
    body: {
      decision: 'decline',
      proposal_hash: 'a'.repeat(64),
      expected_patient_id: patientId,
      expected_thread_id: threadId,
      expected_artifact_id: 'artifact-review:a',
      expected_artifact_updated_at: '2026-10-01T12:00:00.123456Z',
    },
  });
});

test('patient summary opens the inline pending list with API total, exact links and focus return', async ({
  page,
}) => {
  await installQaRoutes(page);
  await page.route('**/api/clinical-pending-work**', async (route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind') ?? 'approval_required';
    const items =
      kind === 'approval_required'
        ? [qaPendingApprovalRow('review:a', 'action-qa', patient)]
        : kind === 'recoverable_draft'
          ? [qaPendingDraftRow('draft:a', patient)]
          : [];
    await route.fulfill(json({ items, total: items.length, next_cursor: null }));
  });
  await page.goto(`/patients/${patientId}`);
  const summary = page.getByRole('region', { name: 'Resumen del paciente' });
  const trigger = summary.getByRole('button', { name: 'Ver pendientes' }).first();
  await trigger.click();
  const inline = summary.getByRole('region', { name: 'Trabajo pendiente' });
  await expect(inline).toBeVisible();
  await expect(inline).toContainText('1 pendiente');
  await expect(inline.getByRole('link', { name: 'Revisar' })).toHaveAttribute(
    'href',
    `/a/${threadId}#approval=action-qa`,
  );
  await inline.getByRole('button', { name: 'Cerrar' }).click();
  await expect(inline).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test.describe('pending dismissal coarse pointer and zoom', () => {
  test.use({ hasTouch: true });

  test('keeps confirmation targets reachable under coarse pointer and 200% zoom', async ({
    page,
  }) => {
    await installQaRoutes(page);
    await installQaDismissal(page, {
      pending: () => [qaPendingDraftRow('draft:a', patient)],
      thread: () => ({
        ...clinicalThread,
        artifacts: [qaThreadArtifact('artifact-draft:a', 'draft')],
        actions: [],
      }),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/assistant?view=pending');
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    await page.getByRole('button', { name: 'Descartar' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    for (const name of ['Mantener', 'Descartar']) {
      const box = await dialog.getByRole('button', { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    }
    await assertNoHorizontalOverflow(page);
    console.log('[PENDING-DISMISSAL-TOUCH]', JSON.stringify({ viewport: '390x844' }));

    // 200% zoom proxy: the CSS viewport halves and the dialog stays reachable.
    await page.setViewportSize({ width: 720, height: 500 });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Mantener' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

const longIdentityPatient = {
  ...patient,
  first_name: 'Paciente sintética Alejandra',
  last_name: 'Apellido compuesto de prueba extensa',
};

const heightTranscriptMessages = [
  'Control preventivo con antecedentes de ortodoncia y sensibilidad reportada.',
  'Hallazgos sin cambios respecto de la última evolución registrada en ficha.',
  'Plan: mantener higiene, control en seis meses y reevaluar sensibilidad.',
  'Indicaciones entregadas por escrito y confirmadas con la paciente.',
].map((content, index) => ({
  id: `height-message-${index}`,
  thread_id: threadId,
  turn_id: `height-turn-${index}`,
  role: 'assistant',
  content,
  created_at: '2026-10-10T12:00:00Z',
}));

const qaHeightDriveFiles: QaDriveFile[] = Array.from({ length: 5 }, (_, index) => ({
  id: `file-qa-height-${index}`,
  name: `informe_ortodoncia_revision_v1${index}.pdf`,
  version: `1${index}`,
  mimeType: 'application/pdf',
  modifiedTime: '2026-01-10T12:00:00Z',
  content: `Contenido clínico sintético del informe ${index + 1}.`,
}));

interface UsableHeightGeometry {
  viewportHeight: number;
  rootBottom: number;
  transcriptTop: number;
  transcriptBottom: number;
  transcriptScrollHeight: number;
  transcriptClientHeight: number;
  composerTop: number;
  composerBottom: number;
  inputBottom: number;
  toolbarBottom: number;
  pageScrollTop: number;
}

async function measureUsableHeight(page: Page, root: Locator): Promise<UsableHeightGeometry> {
  return root.evaluate((node) => {
    const box = (element: Element | null) => (element ? element.getBoundingClientRect() : null);
    const transcript = node.querySelector('.clinical-transcript');
    const composer = node.querySelector('.clinical-composer');
    const rootRect = node.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      rootBottom: rootRect.bottom,
      transcriptTop: box(transcript)?.top ?? 0,
      transcriptBottom: box(transcript)?.bottom ?? 0,
      transcriptScrollHeight: transcript?.scrollHeight ?? 0,
      transcriptClientHeight: transcript?.clientHeight ?? 0,
      composerTop: box(composer)?.top ?? 0,
      composerBottom: box(composer)?.bottom ?? 0,
      inputBottom: box(node.querySelector('textarea'))?.bottom ?? 0,
      toolbarBottom: box(node.querySelector('.clinical-composer-toolbar'))?.bottom ?? 0,
      pageScrollTop: document.scrollingElement?.scrollTop ?? 0,
    };
  });
}

interface UsableDockGeometry {
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

async function measureComposerDock(page: Page, root: Locator): Promise<UsableDockGeometry | null> {
  return root.evaluate((node) => {
    const element = node.querySelector<HTMLElement>('.clinical-composer-dock');
    if (!element) return null;
    return {
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    };
  });
}

test.describe('C6 DE01 visible-height continuity', () => {
  test('software-keyboard height change keeps the writing position and controls reachable', async ({
    page,
  }) => {
    await installQaRoutes(page, { driveEnabled: true, clinicalMessages: heightTranscriptMessages });
    const mutations = trackQaApiMutations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/a/${threadId}`);
    const area = page.locator('.clinical-assistant-area');
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    const note = 'Motivo: control preventivo.\nHallazgos: sin cambios.\nPlan: control en seis meses.';
    await input.fill(note);
    await input.evaluate((element) => {
      element.focus();
      element.setSelectionRange(4, 28);
    });
    const baseline = await measureUsableHeight(page, area);
    expect(baseline.composerBottom).toBeLessThanOrEqual(baseline.viewportHeight);

    // ponytail: emulated keyboard viewport; the physical software keyboard stays an open device gate.
    await page.setViewportSize({ width: 390, height: 420 });
    const shrunk = await measureUsableHeight(page, area);
    expect(shrunk.inputBottom).toBeLessThanOrEqual(shrunk.viewportHeight);
    expect(shrunk.toolbarBottom).toBeLessThanOrEqual(shrunk.viewportHeight);
    expect(shrunk.transcriptScrollHeight).toBeGreaterThan(shrunk.transcriptClientHeight);
    expect(shrunk.pageScrollTop).toBe(0);
    expect(await input.inputValue()).toBe(note);
    expect(
      await input.evaluate((element) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
      })),
    ).toEqual({ start: 4, end: 28 });
    await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();

    const writesAfterLoad = mutations.length;
    await page.setViewportSize({ width: 390, height: 844 });
    const restored = await measureUsableHeight(page, area);
    expect(restored.composerBottom).toBeLessThanOrEqual(restored.viewportHeight);
    expect(await input.inputValue()).toBe(note);
    expect(mutations).toHaveLength(writesAfterLoad);
    console.log('[DE01-KEYBOARD]', JSON.stringify({ baseline, shrunk, restored }));
  });

  test('short landscape and contextual Sheet keep the note and controls reachable', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      driveEnabled: true,
      clinicalPatient: longIdentityPatient,
      clinicalMessages: heightTranscriptMessages,
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`/a/${threadId}`);
    const area = page.locator('.clinical-assistant-area');
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    const note = 'Nota en horizontal corto.\nSegunda línea del borrador clínico.';
    await input.fill(note);
    const landscape = await measureUsableHeight(page, area);
    expect(landscape.composerBottom).toBeLessThanOrEqual(landscape.viewportHeight);
    expect(landscape.inputBottom).toBeLessThanOrEqual(landscape.viewportHeight);
    expect(landscape.transcriptScrollHeight).toBeGreaterThanOrEqual(
      landscape.transcriptClientHeight,
    );
    expect(landscape.pageScrollTop).toBe(0);
    expect(await input.inputValue()).toBe(note);
    await expect(page.getByRole('button', { name: 'Cambiar paciente activo' })).toContainText(
      'Apellido compuesto de prueba extensa',
    );
    await assertNoHorizontalOverflow(page);
    console.log('[DE01-LANDSCAPE]', JSON.stringify({ landscape }));

    await page.setViewportSize({ width: 768, height: 500 });
    await page.goto(`/patients/${patientId}`);
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Asistente clínico' });
    const sheetInput = dialog.getByRole('textbox', { name: 'Nota clínica' });
    await sheetInput.fill(note);
    const sheet = await measureUsableHeight(page, dialog);
    expect(sheet.composerBottom).toBeLessThanOrEqual(sheet.viewportHeight);
    expect(sheet.inputBottom).toBeLessThanOrEqual(sheet.viewportHeight);
    expect(sheet.pageScrollTop).toBe(0);
    expect(await sheetInput.inputValue()).toBe(note);
    await expect(dialog.getByRole('button', { name: /^Cerrar/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    console.log('[DE01-SHEET]', JSON.stringify({ sheet }));
  });

  test('five sources and three queued entries stay reachable at constrained height', async ({
    page,
  }) => {
    const controls = await installQaRoutes(page, {
      driveEnabled: true,
      driveFiles: qaHeightDriveFiles,
      holdClinicalStream: true,
      clinicalMessages: heightTranscriptMessages,
    });
    const mutations = trackQaApiMutations(page);
    try {
      await page.setViewportSize({ width: 390, height: 700 });
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill('Nota inicial para abrir la respuesta.');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      for (const message of ['Pendiente uno', 'Pendiente dos', 'Pendiente tres']) {
        await input.fill(message);
        await page.getByRole('button', { name: 'Encolar' }).click();
      }
      await expect(page.getByText('Mensajes en cola 3/3')).toBeVisible();
      for (const file of qaHeightDriveFiles) await attachQaSource(page, file);
      const note =
        'Nota extensa con cinco documentos adjuntos y tres mensajes en cola.\nSegunda línea del borrador.\nTercera línea del borrador.';
      await input.fill(note);
      const writesAfterSetup = mutations.length;

      await page.setViewportSize({ width: 390, height: 480 });
      const area = page.locator('.clinical-assistant-area');
      const constrained = await measureUsableHeight(page, area);
      console.log('[DE01-SOURCES-QUEUE]', JSON.stringify({ constrained }));
      for (const file of qaHeightDriveFiles) {
        const remove = page.getByRole('button', { name: `Quitar ${file.name}` });
        await remove.scrollIntoViewIfNeeded();
        const box = await remove.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(constrained.viewportHeight);
      }
      const queueSummary = page.getByText('Mensajes en cola 3/3');
      await queueSummary.scrollIntoViewIfNeeded();
      await expect(queueSummary).toBeVisible();
      await input.scrollIntoViewIfNeeded();
      const reachableInput = await input.boundingBox();
      expect(reachableInput).not.toBeNull();
      expect(reachableInput?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((reachableInput?.y ?? 0) + (reachableInput?.height ?? 0)).toBeLessThanOrEqual(
        constrained.viewportHeight,
      );
      const stopControl = page.getByRole('button', { name: 'Detener respuesta' });
      await stopControl.scrollIntoViewIfNeeded();
      const reachableStop = await stopControl.boundingBox();
      expect(reachableStop).not.toBeNull();
      expect(reachableStop?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((reachableStop?.y ?? 0) + (reachableStop?.height ?? 0)).toBeLessThanOrEqual(
        constrained.viewportHeight,
      );
      expect(constrained.pageScrollTop).toBe(0);
      expect(
        await page.evaluate(() => ({
          scrollTop: document.scrollingElement?.scrollTop ?? 0,
          scrollY: window.scrollY,
        })),
      ).toEqual({ scrollTop: 0, scrollY: 0 });
      // ponytail: bounded local scrolling must own this, not the app's main region.
      const scrollOwner = await area.evaluate((node) => {
        const input = node.querySelector('textarea');
        for (let el: HTMLElement | null = input?.parentElement ?? null; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 1
          ) {
            return {
              className: el.className,
              scrollTop: el.scrollTop,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
            };
          }
          if (el === node) break;
        }
        return null;
      });
      const mainScrollTop = await page.locator('.main-area').evaluate((element) => element.scrollTop);
      expect(mainScrollTop).toBe(0);
      expect(scrollOwner).not.toBeNull();
      await page.getByRole('button', { name: 'Encolar' }).click();
      await expect(page.getByRole('alert')).toContainText('Ya tienes 3 mensajes pendientes.');
      await expect(page.getByText('Mensajes en cola 3/3')).toBeVisible();
      expect(await input.inputValue()).toBe(note);
      expect(mutations).toHaveLength(writesAfterSetup);
      console.log(
        '[DE01-SOURCES-QUEUE-REACHABLE]',
        JSON.stringify({ scrollOwner, mainScrollTop }),
      );
    } finally {
      controls.releaseHeldStream();
    }
  });

  test('Stop and mocked voice stay reachable at constrained height', async ({ page }) => {
    const controls = await installQaRoutes(page, {
      driveEnabled: true,
      holdClinicalStream: true,
      clinicalMessages: heightTranscriptMessages,
    });
    const media = await installVoiceMediaMock(page);
    try {
      await page.setViewportSize({ width: 390, height: 600 });
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill('Nota inicial para abrir la respuesta.');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      const note = 'Nota con dictado en curso.\nSegunda línea del borrador.';
      await input.fill(note);
      await media.setMode('grant');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.getByText('Grabando')).toBeVisible();

      await page.setViewportSize({ width: 390, height: 420 });
      const area = page.locator('.clinical-assistant-area');
      const constrained = await measureUsableHeight(page, area);
      expect(constrained.inputBottom).toBeLessThanOrEqual(constrained.viewportHeight);
      expect(constrained.toolbarBottom).toBeLessThanOrEqual(constrained.viewportHeight);
      for (const name of ['Detener respuesta actual', 'Cancelar dictado']) {
        const control = page.getByRole('button', { name });
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(constrained.viewportHeight);
      }
      await expect(page.getByText('Grabando')).toBeVisible();
      expect(constrained.pageScrollTop).toBe(0);
      expect(await input.inputValue()).toBe(note);
      await page.setViewportSize({ width: 390, height: 600 });
      expect(await input.inputValue()).toBe(note);
      console.log('[DE01-VOICE-STOP]', JSON.stringify({ constrained }));
    } finally {
      controls.releaseHeldStream();
    }
  });

  test('PMAX-004 long identity at 390x900 records the banner-to-transcript baseline', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      driveConfigured: true,
      clinicalPatient: longIdentityPatient,
      clinicalMessages: heightTranscriptMessages,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/a/${threadId}`);
    await expect(page.getByRole('log', { name: 'Transcripción clínica' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const measurement = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        return element ? element.getBoundingClientRect() : null;
      };
      const banner = box('.drive-bootstrap-banner');
      const transcript = box('.clinical-transcript');
      const identity = box('button[aria-label="Cambiar paciente activo"]');
      return {
        bannerBottom: banner?.bottom ?? 0,
        transcriptTop: transcript?.top ?? 0,
        regionHeight: (transcript?.top ?? 0) - (banner?.bottom ?? 0),
        identityHeight: identity?.height ?? 0,
      };
    });
    console.log(
      '[PMAX-004-BASELINE]',
      JSON.stringify({ ...measurement, historical: 237.58, target: 213.58 }),
    );
    // The approved acceptance recovers at least 24 CSS px against the 237.58 px historical fixture.
    expect(measurement.regionHeight).toBeLessThanOrEqual(213.58);
    await expect(page.getByRole('button', { name: 'Cambiar paciente activo' })).toContainText(
      'Apellido compuesto de prueba extensa',
    );
  });

  test('desktop, tablet, mobile and 200% zoom keep the populated composer locally scroll-owned', async ({
    page,
  }) => {
    const controls = await installQaRoutes(page, {
      driveEnabled: true,
      driveFiles: qaHeightDriveFiles,
      holdClinicalStream: true,
      clinicalMessages: heightTranscriptMessages,
      clinicalPatient: longIdentityPatient,
    });
    const mutations = trackQaApiMutations(page);
    const note =
      'Nota de verificación DE01 con cinco documentos y tres pendientes.\nSegunda línea del borrador.\nTercera línea del borrador.';
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      const area = page.locator('.clinical-assistant-area');
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill('Abre la respuesta.');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      for (const queuedNote of ['Pendiente uno', 'Pendiente dos', 'Pendiente tres']) {
        await input.fill(queuedNote);
        await page.getByRole('button', { name: 'Encolar' }).click();
      }
      for (const file of qaHeightDriveFiles) await attachQaSource(page, file);
      await input.fill(note);
      await input.evaluate((element) => {
        element.focus();
        element.setSelectionRange(4, 28);
      });
      const writesAfterSetup = mutations.length;

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const dock = await measureComposerDock(page, area);
        expect(dock?.overflowY).toBe('auto');
        await input.scrollIntoViewIfNeeded();
        const geometry = await measureUsableHeight(page, area);
        await expect(input).toBeVisible();
        expect(await input.inputValue()).toBe(note);
        expect(
          await input.evaluate((element) => ({
            start: element.selectionStart,
            end: element.selectionEnd,
          })),
        ).toEqual({ start: 4, end: 28 });
        expect(geometry.transcriptScrollHeight).toBeGreaterThanOrEqual(
          geometry.transcriptClientHeight,
        );
        expect(geometry.inputBottom).toBeLessThanOrEqual(viewport.height);
        expect(geometry.pageScrollTop).toBe(0);
        expect(await page.locator('.main-area').evaluate((element) => element.scrollTop)).toBe(0);
        await assertNoHorizontalOverflow(page);
        const constrained = Boolean(dock && dock.scrollHeight > dock.clientHeight + 1);
        if (constrained) {
          const stop = page.getByRole('button', { name: 'Detener respuesta actual' });
          await stop.scrollIntoViewIfNeeded();
          const stopBox = await stop.boundingBox();
          expect(stopBox).not.toBeNull();
          // Fractional layout can leave a sub-pixel remainder past the viewport edge.
          expect((stopBox?.y ?? -1) + (stopBox?.height ?? 0)).toBeLessThanOrEqual(
            viewport.height + 1,
          );
        } else {
          expect(geometry.toolbarBottom).toBeLessThanOrEqual(viewport.height);
        }
        console.log(
          `[DE01-MATRIX] ${viewport.width}x${viewport.height}`,
          JSON.stringify({ geometry, dock, constrained }),
        );
      }

      expect(mutations).toHaveLength(writesAfterSetup);
      await input.scrollIntoViewIfNeeded();
      const stable = await measureUsableHeight(page, area);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      const reduced = await measureUsableHeight(page, area);
      expect(reduced).toEqual(stable);
      console.log('[DE01-REDUCED-MOTION]', JSON.stringify({ stable, reduced }));
      expect(await input.inputValue()).toBe(note);
      await expect(page.getByRole('button', { name: 'Detener respuesta actual' })).toBeVisible();

      const zoom = await page.context().newCDPSession(page);
      // Model 200% desktop zoom: half-sized CSS viewport with doubled pixel density.
      await zoom.send('Emulation.setDeviceMetricsOverride', {
        width: 720,
        height: 450,
        deviceScaleFactor: 2,
        mobile: false,
      });
      expect(await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio }))).toEqual({
        width: 720,
        density: 2,
      });
      // The `dvh` shell adopts the overridden viewport on a later layout pass than
      // `innerHeight`; measuring immediately reads the previous 844 px layout.
      await expect
        .poll(async () =>
          page.locator('.app-layout').evaluate((element) => element.getBoundingClientRect().height),
        )
        .toBeLessThanOrEqual(450);
      const zoomBefore = await measureUsableHeight(page, area);
      const zoomDock = await measureComposerDock(page, area);
      console.log('[DE01-ZOOM]', JSON.stringify({ zoomBefore, zoomDock }));
      const zoomConstrained = Boolean(
        zoomDock && zoomDock.scrollHeight > zoomDock.clientHeight + 1,
      );
      if (!zoomConstrained) {
        expect(zoomBefore.toolbarBottom).toBeLessThanOrEqual(450);
      }
      await input.scrollIntoViewIfNeeded();
      const zoomInput = await measureUsableHeight(page, area);
      expect(zoomInput.inputBottom).toBeLessThanOrEqual(450);
      const stop = page.getByRole('button', { name: 'Detener respuesta actual' });
      await stop.scrollIntoViewIfNeeded();
      const stopBox = await stop.boundingBox();
      expect(stopBox).not.toBeNull();
      expect((stopBox?.y ?? -1) + (stopBox?.height ?? 0)).toBeLessThanOrEqual(450);
      expect(await input.inputValue()).toBe(note);
      expect(
        await input.evaluate((element) => ({
          start: element.selectionStart,
          end: element.selectionEnd,
        })),
      ).toEqual({ start: 4, end: 28 });
      expect(zoomInput.pageScrollTop).toBe(0);
      await assertNoHorizontalOverflow(page);
      expect(mutations).toHaveLength(writesAfterSetup);
      console.log('[DE01-ZOOM]', JSON.stringify({ zoomBefore, zoomInput, zoomDock }));
    } finally {
      controls.releaseHeldStream();
    }
  });

  test('contextual assistant keeps 420-520 px panel widths locally scroll-owned', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      driveEnabled: true,
      clinicalPatient: longIdentityPatient,
      clinicalMessages: heightTranscriptMessages,
    });
    const mutations = trackQaApiMutations(page);
    const note =
      'Nota contextual de verificación DE01.\nSegunda línea del borrador clínico.';
    for (const viewport of [
      { width: 1024, height: 520 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/patients/${patientId}`);
      await page.getByRole('button', { name: 'Asistente', exact: true }).click();
      const panel = page.getByRole('complementary', { name: 'Asistente del paciente' });
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(panelBox?.width ?? 0).toBeGreaterThanOrEqual(419.5);
      expect(panelBox?.width ?? 0).toBeLessThanOrEqual(520.5);
      const area = panel.locator('.clinical-assistant-area');
      const input = panel.getByRole('textbox', { name: 'Nota clínica' });
      const before = await measureUsableHeight(page, area);
      await input.fill(note);
      await input.evaluate((element) => {
        element.focus();
        element.setSelectionRange(4, 20);
      });
      const afterFill = await measureUsableHeight(page, area);
      expect(afterFill.pageScrollTop).toBe(before.pageScrollTop);
      const dock = await measureComposerDock(page, area);
      expect(dock?.overflowY).toBe('auto');
      await input.scrollIntoViewIfNeeded();
      const reachable = await measureUsableHeight(page, area);
      await expect(input).toBeVisible();
      expect(reachable.inputBottom).toBeLessThanOrEqual(viewport.height);
      expect(await input.inputValue()).toBe(note);
      expect(
        await input.evaluate((element) => ({
          start: element.selectionStart,
          end: element.selectionEnd,
        })),
      ).toEqual({ start: 4, end: 20 });
      await assertNoHorizontalOverflow(page);
      console.log(
        `[DE01-CONTEXTUAL] ${viewport.width}x${viewport.height}`,
        JSON.stringify({ panelWidth: panelBox?.width, before, afterFill, reachable, dock }),
      );
    }
    expect(
      mutations.filter((mutation) => mutation.path !== '/api/clinical-threads/open-context'),
    ).toEqual([]);
  });
});

// C6 DE02 viewport-bounded clinical context modal. The decision is a portaled
// AlertDialog; geometry is measured against the viewport and the dialog's own
// border box, not CSS classes.

function acceptedLimitName(seed: string): string {
  return seed.repeat(Math.ceil(121 / seed.length)).slice(0, 120).trim();
}

const limitPatientA = {
  ...patient,
  first_name: acceptedLimitName('Alejandra del Carmen de la Fuente '),
  last_name: acceptedLimitName('Apellido Compuesto Extensamente Descriptivo '),
};

const limitPatientB = {
  ...patientB,
  first_name: acceptedLimitName('Beatriz del Carmen de la Fuente '),
  last_name: acceptedLimitName('Apellido Compuesto Extensamente Descriptivo '),
};

interface QaBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface QaDecisionMeasurement {
  dialog: QaBox | null;
  choices: Record<string, QaBox | null>;
  active: { text: string; x: number; y: number; bottom: number; right: number } | null;
}

async function measureContextDecision(page: Page): Promise<QaDecisionMeasurement> {
  const dialog = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
  const choices: Record<string, QaBox | null> = {};
  for (const name of ['Mantener paciente', 'Conservar y cambiar', 'Descartar y cambiar']) {
    choices[name] = await dialog.getByRole('button', { name }).boundingBox();
  }
  const active = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent?.trim() ?? '',
      x: rect.x,
      y: rect.y,
      bottom: rect.bottom,
      right: rect.right,
    };
  });
  return { dialog: await dialog.boundingBox(), choices, active };
}

function expectContextDialogBounded(
  measurement: QaDecisionMeasurement,
  viewport: { width: number; height: number },
  label: string,
): void {
  expect(measurement.dialog, `${label} dialog`).not.toBeNull();
  expect(measurement.dialog?.y ?? -1, `${label} dialog top`).toBeGreaterThanOrEqual(-0.5);
  expect(
    (measurement.dialog?.y ?? 0) + (measurement.dialog?.height ?? Number.POSITIVE_INFINITY),
    `${label} dialog bottom`,
  ).toBeLessThanOrEqual(viewport.height + 0.5);
}

async function expectContextChoicesReachable(
  decision: Locator,
  viewport: { width: number; height: number },
  label: string,
): Promise<void> {
  const dialogBox = await decision.boundingBox();
  for (const name of ['Mantener paciente', 'Conservar y cambiar', 'Descartar y cambiar']) {
    const button = decision.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box, `${label} ${name}`).not.toBeNull();
    expect(box?.y ?? -1, `${label} ${name} top`).toBeGreaterThanOrEqual(-0.5);
    expect((box?.y ?? 0) + (box?.height ?? Number.POSITIVE_INFINITY), `${label} ${name} bottom`).toBeLessThanOrEqual(
      viewport.height + 0.5,
    );
    expect(box?.x ?? -1, `${label} ${name} left`).toBeGreaterThanOrEqual(
      (dialogBox?.x ?? 0) - 0.5,
    );
    expect((box?.x ?? 0) + (box?.width ?? Number.POSITIVE_INFINITY), `${label} ${name} right`).toBeLessThanOrEqual(
      (dialogBox?.x ?? 0) + (dialogBox?.width ?? 0) + 0.5,
    );
    expect((box?.y ?? 0) + (box?.height ?? Number.POSITIVE_INFINITY), `${label} ${name} dialog top`).toBeGreaterThanOrEqual(
      (dialogBox?.y ?? 0) - 0.5,
    );
  }
}

test.describe('C6 DE02 viewport-bounded context modal', () => {
  test('accepted-limit identities stay bounded in narrow and short layouts', async ({ page }) => {
    await installQaRoutes(page, {
      patients: [limitPatientA, limitPatientB],
      clinicalPatient: limitPatientA,
    });
    const mutations = trackQaApiMutations(page);
    const draftText = 'Borrador sin enviar para la paciente con identidad extensa.';

    for (const viewport of [
      { width: 320, height: 480 },
      { width: 390, height: 420 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill(draftText);
      await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
      await page.getByRole('option', { name: /Beatriz/ }).click();
      const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
      await expect(decision).toBeVisible();
      await expect(decision).toContainText(limitPatientA.first_name);
      await expect(decision).toContainText(limitPatientA.last_name);
      await expect(decision).toContainText(limitPatientB.first_name);
      await expect(decision).toContainText(limitPatientB.last_name);
      const opened = await measureContextDecision(page);
      console.log(
        `[DE02-NARROW] ${viewport.width}x${viewport.height}`,
        JSON.stringify(opened),
      );
      expectContextDialogBounded(opened, viewport, 'opened');
      await expectContextChoicesReachable(decision, viewport, 'opened');
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
      await assertNoHorizontalOverflow(page);

      await decision.getByRole('button', { name: 'Mantener paciente' }).click();
      await expect(decision).toHaveCount(0);
      await expect(input).toHaveValue(draftText);
    }
    expect(mutations.filter((mutation) => mutation.path.endsWith('/turns'))).toEqual([]);
    expect(mutations).toEqual([]);
  });

  test('growing failure feedback stays bounded through a resize while the decision is open', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      patients: [limitPatientA, limitPatientB],
      clinicalPatient: limitPatientA,
      patientChangeFailures: 1,
    });
    const mutations = trackQaApiMutations(page);
    const draftText = 'Borrador sin enviar antes del intento fallido.';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/a/${threadId}`);
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await input.fill(draftText);
    await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
    await page.getByRole('option', { name: /Beatriz/ }).click();
    const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
    await expect(decision).toBeVisible();
    const writesBefore = mutations.length;
    await decision.getByRole('button', { name: 'Conservar y cambiar' }).click();
    await expect(decision.getByRole('alert')).toHaveText('No pudimos cambiar el paciente activo.');
    expect(mutations.slice(writesBefore)).toEqual([
      {
        method: 'PATCH',
        path: `/api/clinical-threads/${threadId}/active-patient`,
        body: { patient_id: patientBId },
      },
    ]);

    const failed = await measureContextDecision(page);
    console.log('[DE02-FAILED] 390x844', JSON.stringify(failed));
    expectContextDialogBounded(failed, { width: 390, height: 844 }, 'failed');
    await expectContextChoicesReachable(decision, { width: 390, height: 844 }, 'failed');

    for (const viewport of [
      { width: 320, height: 480 },
      { width: 390, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      const resized = await measureContextDecision(page);
      console.log(`[DE02-RESIZED] ${viewport.width}x${viewport.height}`, JSON.stringify(resized));
      expectContextDialogBounded(resized, viewport, 'resized');
      await expectContextChoicesReachable(decision, viewport, 'resized');
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
    }

    await decision.getByRole('button', { name: 'Mantener paciente' }).click();
    await expect(decision).toHaveCount(0);
    await expect(input).toHaveValue(draftText);
    expect(mutations.slice(writesBefore)).toHaveLength(1);
  });

  test('returns focus to the invoked choice after a failed change', async ({ page }) => {
    await installQaRoutes(page, {
      patients: [limitPatientA, limitPatientB],
      clinicalPatient: limitPatientA,
      patientChangeFailures: 1,
    });
    const mutations = trackQaApiMutations(page);
    const draftText = 'Borrador sin enviar tras el fallo de foco.';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/a/${threadId}`);
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await input.fill(draftText);
    await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
    await page.getByRole('option', { name: /Beatriz/ }).click();
    const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
    await expect(decision).toBeVisible();
    const writesBefore = mutations.length;
    const invoked = decision.getByRole('button', { name: 'Conservar y cambiar' });
    await invoked.click();
    await expect(decision.getByRole('alert')).toHaveText('No pudimos cambiar el paciente activo.');
    console.log(
      '[DE02-FOCUS]',
      JSON.stringify({
        activeClass: await page.evaluate(() => document.activeElement?.className ?? null),
        invokedFocused: await invoked.evaluate((element) => element === document.activeElement),
      }),
    );
    await expect(invoked).toBeFocused();
    await decision.getByRole('button', { name: 'Mantener paciente' }).click();
    await expect(decision).toHaveCount(0);
    await expect(input).toHaveValue(draftText);
    expect(mutations.slice(writesBefore)).toHaveLength(1);
  });

  test('keeps the held saving state bounded, trapped and write-once until the change completes', async ({
    page,
  }) => {
    const controls = await installQaRoutes(page, {
      patients: [limitPatientA, limitPatientB],
      clinicalPatient: limitPatientA,
      holdPatientChange: true,
    });
    const mutations = trackQaApiMutations(page);
    const draftText = 'Borrador conservado durante el cambio pendiente.';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/a/${threadId}`);
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await input.fill(draftText);
    await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
    await page.getByRole('option', { name: /Beatriz/ }).click();
    const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
    await expect(decision).toBeVisible();
    const writesBefore = mutations.length;
    await decision.getByRole('button', { name: 'Conservar y cambiar' }).click();
    await controls.patientChangeHeld;

    await expect(decision.getByRole('status')).toHaveText('Cambiando el paciente activo…');
    for (const name of ['Mantener paciente', 'Conservar y cambiar', 'Descartar y cambiar']) {
      await expect(decision.getByRole('button', { name })).toBeDisabled();
    }
    await expect(page.getByRole('textbox', { name: 'Nota clínica' })).toHaveCount(0);
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
    }
    console.log(
      '[DE02-PENDING-TRAP]',
      JSON.stringify(
        await page.evaluate(() => ({
          tag: document.activeElement?.tagName ?? null,
          className: document.activeElement?.className ?? null,
          inDialog: document.activeElement?.closest('.dialog-content') !== null,
          inAppLayout: document.activeElement?.closest('.app-layout') !== null,
        })),
      ),
    );
    expect(
      await page.evaluate(() => document.activeElement?.closest('.app-layout') === null),
    ).toBe(true);
    const pending = await measureContextDecision(page);
    console.log('[DE02-PENDING] 390x844', JSON.stringify(pending));
    expectContextDialogBounded(pending, { width: 390, height: 844 }, 'pending');
    await expectContextChoicesReachable(decision, { width: 390, height: 844 }, 'pending');
    expect(mutations.slice(writesBefore)).toEqual([
      {
        method: 'PATCH',
        path: `/api/clinical-threads/${threadId}/active-patient`,
        body: { patient_id: patientBId },
      },
    ]);

    await page.setViewportSize({ width: 320, height: 480 });
    const resized = await measureContextDecision(page);
    console.log('[DE02-PENDING-RESIZED] 320x480', JSON.stringify(resized));
    expectContextDialogBounded(resized, { width: 320, height: 480 }, 'pending-resized');
    await expectContextChoicesReachable(decision, { width: 320, height: 480 }, 'pending-resized');
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
    expect(mutations.slice(writesBefore)).toHaveLength(1);

    controls.releaseHeldPatientChange();
    await expect(decision).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar paciente activo' })).toBeFocused();
    await expect(
      page.getByText(
        `Borrador conservado para ${limitPatientA.first_name} ${limitPatientA.last_name}.`,
      ),
    ).toBeVisible();
    expect(mutations.slice(writesBefore)).toHaveLength(1);
    expect(mutations.filter((mutation) => mutation.path.endsWith('/turns'))).toEqual([]);
  });

  test('keeps the decision bounded, trapped and discard-free under reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installQaRoutes(page, {
      patients: [limitPatientA, limitPatientB],
      clinicalPatient: limitPatientA,
    });
    const mutations = trackQaApiMutations(page);
    const draftText = 'Borrador sin enviar con movimiento reducido.';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/a/${threadId}`);
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    await input.fill(draftText);
    await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
    await page.getByRole('option', { name: /Beatriz/ }).click();
    const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
    await expect(decision).toBeVisible();
    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true);
    const reduced = await measureContextDecision(page);
    console.log('[DE02-REDUCED] 390x844', JSON.stringify(reduced));
    expectContextDialogBounded(reduced, { width: 390, height: 844 }, 'reduced');
    await expectContextChoicesReachable(decision, { width: 390, height: 844 }, 'reduced');
    await expect(decision.getByRole('button', { name: 'Mantener paciente' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(decision).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar paciente activo' })).toBeFocused();
    await expect(input).toHaveValue(draftText);
    expect(mutations).toEqual([]);
  });

  test.describe('portaled targets and 200% zoom', () => {
    test.use({ hasTouch: true });

    test('keeps the portaled choices at the 44px contract under bounded zoom', async ({ page }) => {
      await installQaRoutes(page, {
        patients: [limitPatientA, limitPatientB],
        clinicalPatient: limitPatientA,
      });
      const mutations = trackQaApiMutations(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
      await page.getByRole('textbox', { name: 'Nota clínica' }).fill('Nota táctil.');
      await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
      await page.getByRole('option', { name: /Beatriz/ }).click();
      const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
      await expect(decision).toBeVisible();
      for (const name of ['Mantener paciente', 'Conservar y cambiar', 'Descartar y cambiar']) {
        const box = await decision.getByRole('button', { name }).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
      }

      const zoom = await page.context().newCDPSession(page);
      await zoom.send('Emulation.setDeviceMetricsOverride', {
        width: 720,
        height: 450,
        deviceScaleFactor: 2,
        mobile: false,
      });
      expect(await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio }))).toEqual(
        { width: 720, density: 2 },
      );
      const zoomed = await measureContextDecision(page);
      console.log('[DE02-ZOOM] 720x450@2', JSON.stringify(zoomed));
      expectContextDialogBounded(zoomed, { width: 720, height: 450 }, 'zoom');
      await expectContextChoicesReachable(decision, { width: 720, height: 450 }, 'zoom');
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
      expect(mutations).toEqual([]);
    });
  });
});

// C6 DE03 unambiguous attached-source identification. Full-name readability is
// measured as rendered text geometry (scroll versus client boxes), never by
// matching classes.

const qaSourcePrefix =
  'informe_consolidado_ortodoncia_paciente_qa_2026_seguimiento_trimestral_';

const qaSuffixDriveFiles: QaDriveFile[] = ['revision_v12.pdf', 'revision_v13.pdf'].map(
  (suffix, index) => ({
    id: `file-qa-suffix-${index + 12}`,
    name: `${qaSourcePrefix}${suffix}`,
    version: `${index + 12}`,
    mimeType: 'application/pdf',
    modifiedTime: '2026-01-10T12:00:00Z',
    content: `Contenido clínico sintético ${index + 1}.`,
  }),
);

const qaUnbrokenSourceName = 'evaluacion_clinica_extensa_'.repeat(20).slice(0, 500);
const qaUnbrokenDriveFile: QaDriveFile = {
  id: 'file-qa-unbroken',
  name: qaUnbrokenSourceName,
  version: '1',
  mimeType: 'application/pdf',
  modifiedTime: '2026-01-10T12:00:00Z',
  content: 'Contenido clínico sintético del documento extenso.',
};

const qaLongDriveFiles: QaDriveFile[] = Array.from({ length: 5 }, (_, index) => ({
  id: `file-qa-long-${index}`,
  name: `${qaSourcePrefix}revision_v1${index}.pdf`,
  version: `1${index}`,
  mimeType: 'application/pdf',
  modifiedTime: '2026-01-10T12:00:00Z',
  content: `Contenido clínico sintético ${index + 1}.`,
}));

interface QaSourceClip {
  tag: string;
  text: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

interface QaSourceGroup {
  names: string[];
  removeLabels: string[];
  clipped: QaSourceClip[];
  groupScrolls: boolean;
  chipCount: number;
}

async function measureSourceGroup(page: Page): Promise<QaSourceGroup> {
  return page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="Documentos adjuntos"]');
    if (!(group instanceof HTMLElement)) {
      return { names: [], removeLabels: [], clipped: [], groupScrolls: false, chipCount: 0 };
    }
    const chipElements = Array.from(group.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const clipped: QaSourceClip[] = [];
    for (const chip of chipElements) {
      for (const element of [chip, ...Array.from(chip.querySelectorAll<HTMLElement>('*'))]) {
        if (
          element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1
        ) {
          clipped.push({
            tag: element.tagName,
            text: (element.textContent ?? '').trim().slice(0, 40),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          });
        }
      }
    }
    const removeLabels = chipElements.map(
      (chip) => chip.querySelector('button')?.getAttribute('aria-label') ?? '',
    );
    return {
      names: removeLabels.map((label) => label.replace(/^Quitar /, '')),
      removeLabels,
      clipped,
      groupScrolls: group.scrollWidth > group.clientWidth + 1,
      chipCount: chipElements.length,
    };
  });
}

test.describe('C6 DE03 distinguishable attached sources', () => {
  test('two common-prefix suffix sources stay fully named and exactly removable in every layout', async ({
    page,
  }) => {
    await installQaRoutes(page, { driveEnabled: true, driveFiles: qaSuffixDriveFiles });
    const mutations = trackQaApiMutations(page);
    const [first, second] = qaSuffixDriveFiles;
    // The contextual assistant has no Drive toggle, so the sources are attached
    // in the full route reached through SPA history: a document reload would
    // drop the shared composer memory that carries the chips to the panel/Sheet.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/patients/${patientId}`);
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Asistente del paciente' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Abrir asistente completo' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${threadId}`));
    await attachQaSource(page, first);
    await attachQaSource(page, second);
    const writes = mutations.length;

    const collected: Array<{ layout: string; group: QaSourceGroup }> = [];
    const collect = async (layout: string): Promise<void> => {
      const group = await measureSourceGroup(page);
      console.log(`[DE03-SUFFIX] ${layout}`, JSON.stringify(group));
      collected.push({ layout, group });
      await assertNoHorizontalOverflow(page);
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await collect('full');

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/patients/${patientId}`));
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Asistente del paciente' }),
    ).toBeVisible();
    await collect('panel');

    await page.setViewportSize({ width: 768, height: 500 });
    await expect(page.getByRole('dialog', { name: 'Asistente clínico' })).toBeVisible();
    await collect('sheet');

    for (const { layout, group } of collected) {
      expect(group.chipCount, layout).toBe(2);
      expect(group.names, layout).toEqual([first.name, second.name]);
      expect(group.removeLabels, layout).toEqual([`Quitar ${first.name}`, `Quitar ${second.name}`]);
      expect(group.clipped, layout).toEqual([]);
    }

    const beforeRemoval = mutations.length;
    await page.getByRole('button', { name: `Quitar ${first.name}` }).click();
    const removed = await measureSourceGroup(page);
    expect(removed.names).toEqual([second.name]);
    expect(mutations.length).toBe(beforeRemoval);
    expect(mutations.slice(writes).filter((mutation) => mutation.path.endsWith('/turns'))).toEqual(
      [],
    );
  });

  test('a 500-character unbroken source name stays fully readable and removable', async ({
    page,
  }) => {
    await installQaRoutes(page, { driveEnabled: true, driveFiles: [qaUnbrokenDriveFile] });
    const mutations = trackQaApiMutations(page);
    expect(qaUnbrokenDriveFile.name).toHaveLength(500);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/patients/${patientId}`);
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    await page.getByRole('link', { name: 'Abrir asistente completo' }).click();
    await expect(page).toHaveURL(new RegExp(`/a/${threadId}`));
    await attachQaSource(page, qaUnbrokenDriveFile);

    const collected: Array<{ layout: string; group: QaSourceGroup }> = [];
    const collect = async (layout: string): Promise<void> => {
      const group = await measureSourceGroup(page);
      console.log(`[DE03-UNBROKEN] ${layout}`, JSON.stringify(group));
      collected.push({ layout, group });
      await assertNoHorizontalOverflow(page);
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await collect('full');

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goBack();
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Asistente del paciente' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 768, height: 500 });
    await expect(page.getByRole('dialog', { name: 'Asistente clínico' })).toBeVisible();
    await collect('sheet');

    for (const { layout, group } of collected) {
      expect(group.chipCount, layout).toBe(1);
      expect(group.names, layout).toEqual([qaUnbrokenDriveFile.name]);
      expect(group.removeLabels, layout).toEqual([`Quitar ${qaUnbrokenDriveFile.name}`]);
      expect(group.clipped, layout).toEqual([]);
    }

    const beforeRemoval = mutations.length;
    await page.getByRole('button', { name: `Quitar ${qaUnbrokenDriveFile.name}` }).click();
    await expect(
      page.getByRole('button', { name: `Quitar ${qaUnbrokenDriveFile.name}` }),
    ).toHaveCount(0);
    expect(mutations.length).toBe(beforeRemoval);
  });

  test('five long sources keep names, work and mocked voice usable together', async ({ page }) => {
    const controls = await installQaRoutes(page, {
      driveEnabled: true,
      driveFiles: qaLongDriveFiles,
      holdClinicalStream: true,
    });
    const mutations = trackQaApiMutations(page);
    const media = await installVoiceMediaMock(page);
    const note = 'Nota DE03 con cinco documentos y dictado.\nSegunda línea del borrador.';
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill('Abre la respuesta retenida.');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      await input.fill('Pendiente en cola.');
      await page.getByRole('button', { name: 'Encolar' }).click();
      await expect(page.getByText('Mensajes en cola 1/3')).toBeVisible();
      for (const file of qaLongDriveFiles) await attachQaSource(page, file);
      await input.fill(note);
      await media.setMode('grant');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.getByText('Grabando')).toBeVisible();
      const writesAfterSetup = mutations.length;

      const group = await measureSourceGroup(page);
      console.log('[DE03-FIVE] 390x844', JSON.stringify(group));
      expect(group.chipCount).toBe(5);
      expect(group.names).toEqual(qaLongDriveFiles.map((file) => file.name));
      expect(group.removeLabels).toEqual(qaLongDriveFiles.map((file) => `Quitar ${file.name}`));
      expect(group.clipped).toEqual([]);
      await assertNoHorizontalOverflow(page);
      expect(await input.inputValue()).toBe(note);
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);

      const removed = qaLongDriveFiles[2];
      await page.getByRole('button', { name: `Quitar ${removed.name}` }).click();
      await expect(page.getByRole('button', { name: `Quitar ${removed.name}` })).toHaveCount(0);
      const remaining = await measureSourceGroup(page);
      expect(remaining.names).toEqual(
        qaLongDriveFiles.filter((file) => file.id !== removed.id).map((file) => file.name),
      );
      expect(mutations.length).toBe(writesAfterSetup);
      await expect(page.getByText('Grabando')).toBeVisible();
      expect(await input.inputValue()).toBe(note);
    } finally {
      controls.releaseHeldStream();
    }
  });

  test('five long sources stay readable and reachable across desktop, tablet, short, zoom and reduced motion', async ({
    page,
  }) => {
    const controls = await installQaRoutes(page, {
      driveEnabled: true,
      driveFiles: qaLongDriveFiles,
      holdClinicalStream: true,
    });
    const mutations = trackQaApiMutations(page);
    const providerReads: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/google-drive')) providerReads.push(`${request.method()} ${path}`);
    });
    const media = await installVoiceMediaMock(page);
    const note = 'Nota DE03 de verificación con cinco documentos.\nSegunda línea del borrador.';
    try {
      // Set up at the narrow width: the desktop Drive pane stays open after each
      // attach, while the narrow overlay closes itself and keeps the sequence simple.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      const input = page.getByRole('textbox', { name: 'Nota clínica' });
      await input.fill('Abre la respuesta retenida.');
      await page.getByRole('button', { name: 'Enviar mensaje' }).click();
      await controls.clinicalStreamEntered;
      await input.fill('Pendiente en cola.');
      await page.getByRole('button', { name: 'Encolar' }).click();
      await expect(page.getByText('Mensajes en cola 1/3')).toBeVisible();
      for (const file of qaLongDriveFiles) await attachQaSource(page, file);
      await input.fill(note);
      await media.setMode('grant');
      await page.getByRole('button', { name: 'Iniciar dictado' }).click();
      await expect(page.getByText('Grabando')).toBeVisible();
      const writesAfterSetup = mutations.length;
      const readsAfterSetup = providerReads.length;

      const assertLayout = async (label: string, viewportHeight: number): Promise<void> => {
        const group = await measureSourceGroup(page);
        console.log(`[DE03-MATRIX] ${label}`, JSON.stringify(group));
        expect(group.chipCount, label).toBe(5);
        expect(group.names, label).toEqual(qaLongDriveFiles.map((file) => file.name));
        expect(group.removeLabels, label).toEqual(
          qaLongDriveFiles.map((file) => `Quitar ${file.name}`),
        );
        expect(group.clipped, label).toEqual([]);
        await assertNoHorizontalOverflow(page);
        await expect(page.getByText('Mensajes en cola 1/3'), label).toBeVisible();
        await expect(page.getByText('Grabando'), label).toBeVisible();
        const stop = page.getByRole('button', { name: 'Detener respuesta actual' });
        await stop.scrollIntoViewIfNeeded();
        const stopBox = await stop.boundingBox();
        expect(stopBox, label).not.toBeNull();
        // Fractional layout can leave a sub-pixel remainder past the viewport edge.
        expect((stopBox?.y ?? -1) + (stopBox?.height ?? 0), label).toBeLessThanOrEqual(
          viewportHeight + 1,
        );
        expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0), label).toBe(0);
        expect(await input.inputValue(), label).toBe(note);
      };

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 400 },
      ]) {
        await page.setViewportSize(viewport);
        await assertLayout(`${viewport.width}x${viewport.height}`, viewport.height);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      const stable = await measureSourceGroup(page);
      await assertLayout('390x844', 844);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      const reduced = await measureSourceGroup(page);
      console.log('[DE03-REDUCED] 390x844', JSON.stringify(reduced));
      expect(reduced).toEqual(stable);

      const zoom = await page.context().newCDPSession(page);
      await zoom.send('Emulation.setDeviceMetricsOverride', {
        width: 720,
        height: 450,
        deviceScaleFactor: 2,
        mobile: false,
      });
      expect(await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio }))).toEqual({
        width: 720,
        density: 2,
      });
      // The `dvh` shell adopts the overridden viewport one layout pass later.
      await expect
        .poll(async () =>
          page.locator('.app-layout').evaluate((element) => element.getBoundingClientRect().height),
        )
        .toBeLessThanOrEqual(450);
      await assertLayout('zoom 720x450', 450);

      expect(mutations.length).toBe(writesAfterSetup);
      expect(mutations.slice(writesAfterSetup).filter((entry) => entry.path.endsWith('/turns'))).toEqual(
        [],
      );
      expect(providerReads.length).toBe(readsAfterSetup);
    } finally {
      controls.releaseHeldStream();
    }
  });

  test.describe('C6 DE03 touch and keyboard removal', () => {
    test.use({ hasTouch: true });

    test('removes exactly the invoked suffix source by touch and by keyboard', async ({ page }) => {
      await installQaRoutes(page, { driveEnabled: true, driveFiles: qaSuffixDriveFiles });
      const mutations = trackQaApiMutations(page);
      const [first, second] = qaSuffixDriveFiles;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/a/${threadId}`);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await attachQaSource(page, first);
      await attachQaSource(page, second);
      const writesAfterSetup = mutations.length;

      // Touch: the coarse-pointer 44px contract applies to the composer row and
      // the full name stays both rendered and exposed as the accessible name.
      for (const file of qaSuffixDriveFiles) {
        const button = page.getByRole('button', { name: `Quitar ${file.name}` });
        const box = await button.boundingBox();
        expect(box, file.name).not.toBeNull();
        expect(box?.width ?? 0, file.name).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, file.name).toBeGreaterThanOrEqual(44);
      }
      expect((await measureSourceGroup(page)).clipped).toEqual([]);
      await page.getByRole('button', { name: `Quitar ${first.name}` }).tap();
      await expect(page.getByRole('button', { name: `Quitar ${first.name}` })).toHaveCount(0);
      expect((await measureSourceGroup(page)).names).toEqual([second.name]);
      expect(mutations.length).toBe(writesAfterSetup);

      // Keyboard: re-attach and remove the other source with Enter only.
      await attachQaSource(page, first);
      expect((await measureSourceGroup(page)).names).toEqual([second.name, first.name]);
      const keyboardButton = page.getByRole('button', { name: `Quitar ${second.name}` });
      await keyboardButton.focus();
      expect(await keyboardButton.evaluate((element) => document.activeElement === element)).toBe(
        true,
      );
      await page.keyboard.press('Enter');
      await expect(keyboardButton).toHaveCount(0);
      expect((await measureSourceGroup(page)).names).toEqual([first.name]);
      expect(mutations.length).toBe(writesAfterSetup);
      expect(mutations.filter((entry) => entry.path.endsWith('/turns'))).toEqual([]);
    });
  });

  test('a tall expanded source row keeps DE01 reachability and the DE02 decision bounded', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      driveEnabled: true,
      driveFiles: qaLongDriveFiles,
      patients: [patient, patientB],
    });
    const mutations = trackQaApiMutations(page);
    const note = 'Nota DE03 con cinco documentos largos.';
    await page.setViewportSize({ width: 390, height: 480 });
    await page.goto(`/a/${threadId}`);
    const area = page.locator('.clinical-assistant-area');
    const input = page.getByRole('textbox', { name: 'Nota clínica' });
    for (const file of qaLongDriveFiles) await attachQaSource(page, file);
    await input.fill(note);
    const writesAfterSetup = mutations.length;

    // DE01: the wrapped row stays complete and the composer reaches the window
    // through the dock's own scroll without moving the page.
    expect((await measureSourceGroup(page)).clipped).toEqual([]);
    const dock = await measureComposerDock(page, area);
    expect(dock?.overflowY).toBe('auto');
    await input.scrollIntoViewIfNeeded();
    const geometry = await measureUsableHeight(page, area);
    console.log('[DE03-TALL] 390x480', JSON.stringify({ dock, geometry }));
    expect(geometry.inputBottom).toBeLessThanOrEqual(480);
    expect(geometry.pageScrollTop).toBe(0);
    await assertNoHorizontalOverflow(page);

    // DE02: the same populated state keeps the decision bounded and recoverable.
    await page.getByRole('button', { name: 'Cambiar paciente activo' }).click();
    await page.getByRole('option', { name: /Bruno Ríos/ }).click();
    const decision = page.getByRole('alertdialog', { name: 'Trabajo sin enviar' });
    await expect(decision).toBeVisible();
    const bounds = await measureContextDecision(page);
    console.log('[DE03-TALL-DECISION] 390x480', JSON.stringify(bounds));
    expectContextDialogBounded(bounds, { width: 390, height: 480 }, 'DE03 tall');
    await expectContextChoicesReachable(decision, { width: 390, height: 480 }, 'DE03 tall');
    await page.keyboard.press('Escape');
    await expect(decision).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar paciente activo' })).toBeFocused();
    await expect(input).toHaveValue(note);
    expect(mutations.length).toBe(writesAfterSetup);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  });
});

const collisionThreadTitle = 'Evolución dental';
const collisionTieAt = '2026-10-10T12:00:10.000Z';
const collisionSameMinuteAt = '2026-10-10T12:00:50.000Z';

function collisionSummary(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: collisionThreadTitle,
    active_patient_id: patientId,
    active_turn_id: null,
    updated_at: collisionTieAt,
    preview: null,
    approval_pending: false,
    ...overrides,
  };
}

test.describe('C7 PMAX-002 distinguishable clinical collision rows', () => {
  test('keeps collision labels visible, accessible and request-free across layouts and zoom', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      clinicalThreadSummaries: [
        collisionSummary('thread-b', { active_turn_id: 'turn-b' }),
        collisionSummary('thread-a'),
        collisionSummary('thread-c', {
          updated_at: collisionSameMinuteAt,
          approval_pending: true,
          preview: 'Contenido clínico confidencial QA',
        }),
      ],
    });
    const mutations = trackQaApiMutations(page);
    const listReads: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        new URL(request.url()).pathname === '/api/clinical-threads'
      ) {
        listReads.push(new URL(request.url()).pathname);
      }
    });

    await page.goto('/a/thread-a');
    const rows = page.getByRole('button', { name: /^Evolución dental/ });
    await expect(rows).toHaveCount(3);
    const readLabels = () =>
      rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
    const expectedLabels = [
      'Evolución dental · Conversación 2',
      'Evolución dental · Conversación 1',
      'Evolución dental · Conversación 3',
    ];
    expect(await readLabels()).toEqual(expectedLabels);

    // Active/running/pending states stay attached to their exact ordinal rows.
    await expect(rows.nth(0)).toHaveAttribute('aria-busy', 'true');
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'page');
    await expect(rows.nth(0)).toContainText('Conversación 2');
    await expect(rows.nth(1)).toContainText('Conversación 1');
    await expect(rows.nth(2)).toContainText('Conversación 3');
    await expect(rows.nth(2).getByLabel('Pendiente de aprobación')).toBeVisible();
    await expect(rows.nth(0).getByLabel('Pendiente de aprobación')).toHaveCount(0);
    for (const ordinal of [1, 2, 3]) {
      await expect(
        page.getByRole('button', {
          name: `Acciones para Evolución dental · Conversación ${ordinal}`,
        }),
      ).toBeVisible();
    }

    // No preview content or raw identifier reaches names or tooltips.
    await expect(page.getByText('Contenido clínico confidencial QA')).toHaveCount(0);
    expect(await page.locator('[aria-label*="thread-"], [title*="thread-"]').count()).toBe(0);

    // Search and clear filter client-side without renumbering or issuing a read.
    const readsBeforeSearch = listReads.length;
    await page.getByRole('button', { name: 'Buscar en conversaciones' }).click();
    const searchbox = page.getByRole('searchbox');
    await searchbox.fill('Evolución dental');
    await expect(rows).toHaveCount(3);
    expect(await readLabels()).toEqual(expectedLabels);
    await searchbox.fill('sin coincidencia');
    await expect(rows).toHaveCount(0);
    await searchbox.fill('');
    await expect(rows).toHaveCount(3);
    expect(await readLabels()).toEqual(expectedLabels);
    expect(listReads.length).toBe(readsBeforeSearch);
    expect(mutations).toEqual([]);

    // Keyboard: row focus, menu-trigger handoff and Enter reach the exact destination.
    await rows.nth(0).focus();
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Acciones para Evolución dental · Conversación 2' }),
    ).toBeFocused();
    await rows.nth(0).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/a\/thread-b$/);
    await expect(rows).toHaveCount(3);
    expect(await readLabels()).toEqual(expectedLabels);

    // Desktop, tablet and drawer widths keep the same labels with no page overflow.
    for (const [width, height] of [
      [1440, 900],
      [768, 1024],
      [390, 844],
      [360, 800],
    ] as Array<[number, number]>) {
      await page.setViewportSize({ width, height });
      if (width <= 767 && (await page.locator('.sidebar-container.open').count()) === 0) {
        const navTrigger = page.getByRole('button', { name: 'Abrir navegación' });
        await expect(navTrigger).toBeVisible();
        await navTrigger.click();
      }
      await expect(rows).toHaveCount(3);
      expect(await readLabels()).toEqual(expectedLabels);
      await assertNoHorizontalOverflow(page);
      console.log(
        '[PMAX-002-LAYOUT]',
        JSON.stringify({ width, height, labels: await readLabels() }),
      );
    }

    // An unchanged-group refresh (the existing 2s poll) preserves every ordinal.
    const readsBeforeRefresh = listReads.length;
    await page.clock.runFor(2100);
    await expect.poll(() => listReads.length).toBeGreaterThan(readsBeforeRefresh);
    expect(await readLabels()).toEqual(expectedLabels);

    // 200% desktop zoom proxy: half-sized CSS viewport with doubled density.
    const zoom = await page.context().newCDPSession(page);
    await zoom.send('Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 450,
      deviceScaleFactor: 2,
      mobile: false,
    });
    expect(await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio }))).toEqual({
      width: 720,
      density: 2,
    });
    await expect(rows.nth(0)).toBeVisible();
    expect(await readLabels()).toEqual(expectedLabels);
    await assertNoHorizontalOverflow(page);

    expect(mutations).toEqual([]);
    console.log(
      '[PMAX-002]',
      JSON.stringify({ labels: await readLabels(), listReads: listReads.length }),
    );
  });

  test('recomputes labels on membership change and sends exact rename/delete identities', async ({
    page,
  }) => {
    await installQaRoutes(page, {
      clinicalThreadSummaries: [
        collisionSummary('thread-a'),
        collisionSummary('thread-b'),
        collisionSummary('thread-c'),
      ],
    });
    const mutations = trackQaApiMutations(page);
    await page.goto('/a/thread-a');
    const collisionRows = page.getByRole('button', {
      name: /^Evolución dental · Conversación \d$/,
    });
    await expect(collisionRows).toHaveCount(3);
    const readLabels = () =>
      collisionRows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('aria-label')),
      );
    expect(await readLabels()).toEqual([
      'Evolución dental · Conversación 1',
      'Evolución dental · Conversación 2',
      'Evolución dental · Conversación 3',
    ]);

    // Rename the middle row through the shared menu; the stored title seeds the input.
    await page
      .getByRole('button', { name: 'Acciones para Evolución dental · Conversación 2' })
      .click();
    await page.getByRole('menuitem', { name: 'Renombrar' }).click();
    const renameInput = page.getByRole('textbox', { name: 'Renombrar conversación' });
    await expect(renameInput).toHaveValue('Evolución dental');
    await renameInput.fill('Evolución dental renombrada');
    await renameInput.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Evolución dental renombrada', exact: true }),
    ).toBeVisible();
    await expect(collisionRows).toHaveCount(2);
    expect(await readLabels()).toEqual([
      'Evolución dental · Conversación 1',
      'Evolución dental · Conversación 2',
    ]);
    expect(mutations.filter((mutation) => mutation.method === 'PATCH')).toEqual([
      {
        method: 'PATCH',
        path: '/api/clinical-threads/thread-b',
        body: { title: 'Evolución dental renombrada' },
      },
    ]);

    // Delete the remaining collision partner; the survivor drops the ordinal.
    await page
      .getByRole('button', { name: 'Acciones para Evolución dental · Conversación 2' })
      .click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Eliminar conversación clínica?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(collisionRows).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Evolución dental', exact: true })).toBeVisible();
    expect(mutations.filter((mutation) => mutation.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: '/api/clinical-threads/thread-c', body: null },
    ]);
    console.log('[PMAX-002-ACTIONS]', JSON.stringify({ mutations }));
  });
});
