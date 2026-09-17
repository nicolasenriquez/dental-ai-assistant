import { type Locator, type Page, type Request, expect, test } from '@playwright/test';

const threadId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const actionId = '33333333-3333-4333-8333-333333333333';
const secondActionId = '33333333-3333-4333-8333-333333333334';
const thirdActionId = '33333333-3333-4333-8333-333333333335';
const userId = '55555555-5555-4555-8555-555555555555';
const evolutionId = '44444444-4444-4444-8444-444444444444';
const sourceFileId = '66666666-6666-4666-8666-666666666666';
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

const googleAuthConfig = {
  mode: 'google',
  google_client_id: 'test-client.apps.googleusercontent.com',
  drive_enabled: true,
  drive_auto_onboard: false,
};

const connectedDriveStatus = {
  configured: true,
  status: 'connected',
  workspace: { folder_name: 'Dental AI Assistant' },
};

const journal = {
  period_type: 'weekly',
  period_key: '2026-W03',
  journal_part: 1,
  display_name: 'Evoluciones — 2026-W03.txt',
};

const remoteJournalDetail = {
  journal: {
    ...journal,
    updated_at: '2026-01-16T12:00:00Z',
    entries: [
      {
        evolution_id: evolutionId,
        occurred_at: '2026-01-15T12:00:00Z',
        patient_display_name: 'Ana Pérez',
        patient_rut_masked: patient.rut_masked,
        content: 'Edición remota confirmada en Drive.',
      },
    ],
  },
};

const draft = {
  context: 'Control preventivo',
  findings: 'Encías sin sangrado al sondaje.',
  assessment: 'Salud periodontal estable.',
  treatment: 'Mantener higiene y controles.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

function thread(actions: MockAction[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id: threadId,
    owner_user_id: userId,
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
    ...overrides,
  };
}

function hydratedArtifact(overrides: Record<string, unknown> = {}): MockArtifact {
  return {
    id: 'draft-hydrated',
    owner_user_id: userId,
    thread_id: threadId,
    turn_id: 'turn-hydrated',
    patient_id: patientId,
    artifact_type: 'clinical_draft',
    status: 'draft',
    source_note: 'Nota hidratada.',
    generated_draft: draft,
    draft,
    evolution_at: '2026-01-15T12:01:00Z',
    created_at: '2026-01-15T12:01:00Z',
    updated_at: '2026-01-15T12:01:00Z',
    resolved_at: null,
    ...overrides,
  };
}

function approval(overrides: Record<string, unknown> = {}): MockAction {
  return {
    id: actionId,
    thread_id: threadId,
    turn_id: 'turn-hydrated',
    artifact_id: 'draft-hydrated',
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
    status: 'approved',
    expires_at: '2026-01-15T12:30:00Z',
    created_at: '2026-01-15T12:02:00Z',
    resolved_at: '2026-01-15T12:03:00Z',
    result_resource_id: evolutionId,
    patient,
    ...overrides,
  };
}

async function mockGoogleBootstrap(
  page: Page,
  driveStatus: Record<string, unknown> = connectedDriveStatus,
): Promise<void> {
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(googleAuthConfig),
    }),
  );
  await page.route('**/api/google-drive/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(driveStatus),
    }),
  );
}

interface ClinicalHarnessOptions {
  driveStatus?: Record<string, unknown>;
  driveRetry?: (count: number) => Promise<Record<string, unknown>>;
  journalDetail?: Record<string, unknown>;
  activePatientPatch?: (request: Request) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
}

async function installDriveRoutes(
  page: Page,
  options: ClinicalHarnessOptions = {},
): Promise<{ retryCount: () => number; journalDetail: Record<string, unknown> }> {
  let retries = 0;
  const detail = options.journalDetail ?? remoteJournalDetail;
  const source = {
    id: sourceFileId,
    name: 'Nota remota.txt',
    mimeType: 'text/plain',
    modifiedTime: '2026-01-15T12:00:00Z',
    version: '7',
    kind: 'text',
    editable: true,
  };
  const managedFiles = [
    {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Evolución septiembre.md',
      mimeType: 'text/markdown',
      modifiedTime: '2026-09-16T14:30:00Z',
      version: '27',
    },
    {
      id: '77777777-7777-4777-8777-777777777778',
      name: 'Indicaciones postoperatorias.txt',
      mimeType: 'text/plain',
      modifiedTime: '2026-09-15T14:30:00Z',
      version: '12',
    },
    {
      id: '77777777-7777-4777-8777-777777777779',
      name: 'Plan de tratamiento.pdf',
      mimeType: 'application/pdf',
      modifiedTime: '2026-09-14T14:30:00Z',
      version: '8',
    },
    {
      id: '77777777-7777-4777-8777-777777777780',
      name: 'Resumen clínico.txt',
      mimeType: 'text/plain',
      modifiedTime: '2026-09-13T14:30:00Z',
      version: '4',
    },
  ];

  await page.route('**/api/google-drive/sources', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files: [source], next_page_token: null }),
    }),
  );
  await page.route('**/api/google-drive/sources/*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(source) }),
  );
  await page.route('**/api/google-drive/sources/*/content', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { content: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...source, content: body.content, version: '8' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...source, content: 'Contenido remoto.' }),
    });
  });
  await page.route('**/api/google-drive/files*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'POST' && url.pathname.endsWith('/search')) {
      const body = request.postDataJSON() as { query?: string };
      const query = body.query?.toLocaleLowerCase() ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: managedFiles.filter((file) => file.name.toLocaleLowerCase().includes(query)),
          next_page_token: null,
        }),
      });
      return;
    }

    const detailMatch = url.pathname.match(/\/files\/([^/]+)$/);
    if (detailMatch) {
      const file = managedFiles.find((item) => item.id === detailMatch[1]);
      await route.fulfill({
        status: file ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          file ? { ...file, content: `Contenido remoto de ${file.name}.` } : { detail: 'Not found' },
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files: managedFiles, next_page_token: null }),
    });
  });
  await page.route('**/api/google-drive/evolution-journals/preferences', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ frequency: 'daily' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ frequency: 'weekly' }),
    });
  });
  await page.route('**/api/google-drive/evolution-journals', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ journals: [journal] }),
    }),
  );
  await page.route(
    /\/api\/google-drive\/evolution-journals\/(weekly|daily)\/[^/]+\/parts\/\d+$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail),
      }),
  );
  await page.route('**/api/clinical/evolutions/*/drive-export/retry', async (route) => {
    retries += 1;
    const response = options.driveRetry
      ? await options.driveRetry(retries)
      : { status: 'synced', journal };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ drive_export: response }),
    });
  });

  return { retryCount: () => retries, journalDetail: detail };
}

async function setupClinicalHarness(
  page: Page,
  initialThread: Record<string, unknown>,
  options: ClinicalHarnessOptions = {},
): Promise<{ setThread: (next: Record<string, unknown>) => void; driveRetries: () => number }> {
  await mockGoogleBootstrap(page, options.driveStatus);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: userId,
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
  let currentThread = initialThread;
  await page.route('**/api/clinical-threads', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ...currentThread,
            preview: null,
            active_patient_id: currentThread.active_patient ? patientId : null,
            approval_pending: Boolean(currentThread.pending_action),
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(currentThread),
    });
  });
  await page.route(`**/api/clinical-threads/${threadId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentThread),
    }),
  );
  await page.route(`**/api/clinical-threads/${threadId}/active-patient`, async (route) => {
    if (options.activePatientPatch) {
      const response = await options.activePatientPatch(route.request());
      if (response.status >= 200 && response.status < 300) currentThread = response.body;
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
      return;
    }

    const body = route.request().postDataJSON() as { patient_id?: string | null };
    currentThread = {
      ...currentThread,
      active_patient: body.patient_id ? patient : null,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentThread),
    });
  });
  const drive = await installDriveRoutes(page, options);
  await page.goto(`/a/${threadId}`);
  await expect(
    page
      .getByRole('heading', { name: 'Evolución clínica' })
      .or(page.getByRole('heading', { name: 'Trabaja más rápido con tus evoluciones' })),
  ).toBeVisible();
  const header = page.locator('.workspace-header');
  const driveButton = page.getByRole('button', { name: 'Abrir Google Drive' });
  const [headerBox, driveBox] = await Promise.all([
    header.boundingBox(),
    driveButton.boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(driveBox).not.toBeNull();
  expect(driveBox?.y).toBeGreaterThanOrEqual(headerBox?.y ?? 0);
  expect((driveBox?.y ?? 0) + (driveBox?.height ?? 0)).toBeLessThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0),
  );
  return {
    setThread: (next) => {
      currentThread = next;
    },
    driveRetries: drive.retryCount,
  };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });
  expect(hasOverflow).toBe(false);
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'boundary', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`assistant and Drive visual states at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const harness = await setupClinicalHarness(page, thread());
    await expectNoHorizontalOverflow(page);
    harness.setThread(thread([], { artifacts: [hydratedArtifact()] }));
    await page.reload();
    const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
    await expect(artifact).toHaveAttribute('data-clinical-stage', 'draft');
    await expect(artifact).toContainText(patient.first_name);
    await expect(artifact.getByRole('button', { name: 'Revisar y guardar' })).toBeVisible();
    await expect(artifact.locator('[aria-current="step"]')).toContainText('Borrador');
    await expectNoHorizontalOverflow(page);
    if (viewport.name === 'desktop') {
      await expect(page).toHaveScreenshot('assistant-draft-desktop.png', {
        animations: 'disabled',
      });
    } else if (viewport.name === 'mobile') {
      await expect(page).toHaveScreenshot('assistant-mobile.png', {
        animations: 'disabled',
      });
    }

    const driveUtility = page.locator('[data-drive-utility="true"]');
    await driveUtility.click();
    await expect(
      page.getByRole('region', { name: 'Espacio de documentos de Google Drive' }),
    ).toBeVisible();
    const drivePatientContext = page.locator('.drive-workspace-patient-context');
    await expect(drivePatientContext).toContainText(`${patient.first_name} ${patient.last_name}`);
    await expect(drivePatientContext).toContainText(patient.rut_masked);
    if (viewport.width <= 1024) {
      await expect(page.locator('.drive-sheet-content')).toBeVisible();
      await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
      await expect(page.locator('.workspace-row')).toHaveCount(0);
    } else {
      await expect(page.locator('.workspace-row')).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    if (viewport.name === 'desktop') {
      await expect(page).toHaveScreenshot('drive-browser-desktop.png', {
        animations: 'disabled',
      });
    }

    await page.getByRole('button', { name: 'Documentos' }).click();
    await expect(
      page.getByRole('button', { name: 'Abrir Evolución septiembre.md', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Vista en cuadrícula' }).click();
    await expect(page.getByRole('button', { name: 'Vista en cuadrícula' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.drive-file-grid')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Acceso rápido' })).toBeVisible();
    await page.getByRole('button', { name: 'Vista en lista' }).click();
    await expect(page.locator('.drive-file-table-body')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await expect(page).toHaveScreenshot(`drive-documents-browser-${viewport.name}.png`, {
        animations: 'disabled',
      });
    }

    await page.getByRole('button', { name: 'Ver detalles de Evolución septiembre.md' }).click();
    await expect(page.getByText('Detalles del documento')).toBeVisible();
    await expect(page.getByText('Administrado por Dental AI Assistant')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await expect(page).toHaveScreenshot(`drive-document-details-${viewport.name}.png`, {
        animations: 'disabled',
      });
    }

    await page.getByRole('button', { name: 'Volver a documentos' }).click();
    await expect(
      page.getByRole('button', { name: 'Ver detalles de Evolución septiembre.md' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Notas' }).click();

    await page.getByRole('button', { name: /Nota remota\.txt/ }).click();
    await expect(page.getByRole('heading', { name: 'Nota remota.txt' })).toBeVisible();
    const editor = page.getByRole('textbox', { name: 'Contenido del documento' });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await expect(page.getByText('2 palabras seleccionadas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Incorporar al borrador' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.width > 1024) {
      const main = await page.locator('.workspace-panel-main').boundingBox();
      const accessory = await page.locator('.workspace-panel-accessory').boundingBox();
      expect(main?.width).toBeGreaterThan(accessory?.width ?? 0);
    } else {
      await expect(page.locator('.drive-sheet-content')).toBeVisible();
    }
    if (viewport.name !== 'boundary') {
      await expect(page).toHaveScreenshot(`drive-document-${viewport.name}.png`, {
        animations: 'disabled',
      });
    }

    if (viewport.name === 'desktop') {
      await page.getByRole('button', { name: 'Incorporar al borrador' }).click();
      await expect(page.getByRole('status', { name: 'Incorporado al borrador' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Nota clínica' })).toHaveValue(
        'Fuente: Google Drive · Nota remota.txt\nContenido remoto.',
      );
    }
    if (viewport.width <= 1024) {
      await page.keyboard.press('Escape');
      await expect(page.locator('.drive-sheet-content')).toHaveCount(0);
      await expect(driveUtility).toBeFocused();
    }
  });
}

for (const failure of [
  { name: 'conflict', status: 409, heading: 'El documento cambió' },
  {
    name: 'error',
    status: 503,
    heading: 'No se pudo confirmar el guardado. Tu trabajo local se conserva.',
  },
] as const) {
  test(`Drive document ${failure.name} preserves local text`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setupClinicalHarness(page, thread());
    await page.route('**/api/google-drive/sources/*/content', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: failure.status,
          contentType: 'application/json',
          body: JSON.stringify({ detail: failure.heading }),
        });
        return;
      }
      await route.fallback();
    });
    await page.locator('[data-drive-utility="true"]').click();
    await page.getByRole('button', { name: /Nota remota\.txt/ }).click();
    const editor = page.getByRole('textbox', { name: 'Contenido del documento' });
    await editor.fill('Cambio clínico local conservado.');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(editor).toHaveValue('Cambio clínico local conservado.');
    await expect(page.getByText(failure.heading, { exact: true })).toBeVisible();
    if (failure.name === 'conflict') {
      await expect(page.getByRole('button', { name: 'Ver versión actual' })).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId('accessory')).toHaveScreenshot(
      `drive-${failure.name}-desktop.png`,
      {
        animations: 'disabled',
      },
    );
  });
}

test('opens header patient picker with visible options', async ({ page }) => {
  await setupClinicalHarness(page, thread());

  const trigger = page.getByRole('button', { name: 'Seleccionar paciente activo' });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const option = page.getByRole('option', { name: /Ana Pérez/ });
  await expect(option).toBeVisible();
  const optionBounds = await option.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return { top, bottom };
  });
  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(optionBounds.top).toBeGreaterThanOrEqual(0);
  expect(optionBounds.bottom).toBeLessThanOrEqual(viewportHeight);

  await option.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('shows active-patient persistence failures and retries the selection', async ({ page }) => {
  const requestBodies: Array<Record<string, unknown>> = [];
  let failNext = true;
  await setupClinicalHarness(page, thread([], { active_patient: null }), {
    activePatientPatch: async (request) => {
      requestBodies.push(request.postDataJSON() as Record<string, unknown>);
      if (failNext) {
        failNext = false;
        return { status: 500, body: { detail: 'simulated selection failure' } };
      }
      return { status: 200, body: thread([], { active_patient: patient }) };
    },
  });

  const trigger = page.getByRole('button', { name: 'Seleccionar paciente activo' });
  await trigger.click();
  await page.getByRole('option', { name: /Ana Pérez/ }).click();

  await expect(page.getByRole('alert')).toContainText('No pudimos cambiar el paciente activo.');
  await expect(trigger).toContainText('Seleccionar paciente');
  expect(requestBodies).toEqual([{ patient_id: patientId }]);

  await page.getByRole('alert').getByRole('button', { name: 'Reintentar' }).click();
  await expect(trigger).toContainText('Ana Pérez');
  await expect(page.getByPlaceholder('Escribe o dicta la nota clínica…')).toBeVisible();
  expect(requestBodies).toEqual([{ patient_id: patientId }, { patient_id: patientId }]);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Seleccionar paciente activo' })).toContainText(
    'Ana Pérez',
  );
});

test('keeps the patient context before secondary actions on mobile', async ({ page }) => {
  await setupClinicalHarness(page, thread());
  await page.setViewportSize({ width: 390, height: 844 });

  const context = page.locator('.workspace-header:visible .workspace-header__context');
  const actions = page.locator('.workspace-header:visible .workspace-header__actions');
  const contextBounds = await context.boundingBox();
  const actionBounds = await actions.boundingBox();
  expect(contextBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  expect(contextBounds?.y).toBeLessThan(actionBounds?.y ?? 0);

  await page.getByRole('button', { name: 'Seleccionar paciente activo' }).click();
  const option = page.getByRole('option', { name: /Ana Pérez/ });
  await expect(option).toBeVisible();
  const optionBounds = await option.boundingBox();
  expect(optionBounds?.x).toBeGreaterThanOrEqual(0);
  expect((optionBounds?.x ?? 0) + (optionBounds?.width ?? 0)).toBeLessThanOrEqual(390);
});

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
  await page.waitForTimeout(220);
}

test('clinical assistant preserves the complete two-turn review flow', async ({ page }) => {
  let turnCount = 0;
  let actionCount = 0;
  let threadState = thread();

  await mockGoogleBootstrap(page);
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
      title: 'Ana Pérez · Evolución · 15 ene',
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
    await new Promise((resolve) => setTimeout(resolve, 150));
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
    const nextActionId =
      actionCount === 1 ? actionId : actionCount === 2 ? secondActionId : thirdActionId;
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
      drive_export:
        decision === 'approve'
          ? {
              status: 'pending',
              journal,
            }
          : null,
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
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resolved),
    });
  });
  await page.route('**/api/clinical-actions/*/return-to-editing', async (route) => {
    const returnedId = route.request().url().split('/').slice(-2, -1)[0];
    const current = threadState.actions.find((candidate) => candidate.id === returnedId);
    threadState = {
      ...threadState,
      actions: threadState.actions.filter((candidate) => candidate.id !== returnedId),
      pending_action: null,
      pending_action_patient: null,
      artifacts: threadState.artifacts.map((artifact) =>
        artifact.id === current?.artifact_id ? { ...artifact, status: 'draft' } : artifact,
      ),
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: returnedId,
        thread_id: threadId,
        artifact_id: current?.artifact_id,
      }),
    });
  });
  await page.route('**/api/clinical/evolutions/*/drive-export/retry', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ drive_export: { status: 'synced', journal } }),
    }),
  );

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
  await expect(page.locator('.app-layout')).toMatchAriaSnapshot({
    name: 'clinical-empty.aria.yml',
  });

  const sidebar = page.locator('#app-sidebar');
  await page.keyboard.press('Control+k');
  await expect(sidebar.getByRole('searchbox', { name: 'Buscar en asistente' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sidebar.getByRole('button', { name: 'Buscar en asistente' })).toBeVisible();
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
  await historyButton.click();
  await expect(
    sidebar.getByRole('button', { name: 'Ana Pérez · Control', exact: true }),
  ).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const composer = page.getByTestId('clinical-composer').getByLabel('Nota clínica');
  await composer.fill('Control preventivo sin hallazgos nuevos.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('Pensando…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evolución clínica' })).toBeVisible();
  await expect(
    page.locator('.workspace-header').getByText('Ana Pérez · Evolución · 15 ene'),
  ).toBeVisible();
  await expect(page.getByText('Pensando…')).toHaveCount(0);
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  await expect(page.getByText('Preparé un borrador para tu revisión.')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Tú' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Asistente' })).toBeVisible();
  const liveArtifact = page.getByRole('article', { name: 'Evolución clínica' });
  await liveArtifact.evaluate((element) => element.setAttribute('data-e2e-mounted', 'true'));
  await expect(page.locator('.clinical-artifact')).toHaveCount(1);
  await expect(page.locator('.clinical-result, .clinical-receipt')).toHaveCount(0);
  await settleClinicalItem(page, page.getByRole('article', { name: 'Evolución clínica' }));
  await expect(page.locator('.clinical-artifact')).toHaveCSS('border-style', 'solid');

  await page.getByRole('button', { name: 'Ver evidencia' }).click();
  await expect(page.getByRole('button', { name: 'Ocultar evidencia' })).toBeVisible();
  await expect(
    page
      .getByRole('article', { name: 'Evolución clínica' })
      .getByText('Control preventivo sin hallazgos nuevos.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ocultar evidencia' }).click();
  await expect(page.getByText('Control preventivo sin hallazgos nuevos.')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver evidencia' }).click();
  await page.getByRole('button', { name: 'Editar nota original' }).click();
  await page.getByLabel('Editar nota clínica original').fill('Nota fuente corregida.');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(
    page
      .getByRole('article', { name: 'Evolución clínica' })
      .getByText('Control preventivo sin hallazgos nuevos.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar nota original' }).click();
  await page.getByLabel('Editar nota clínica original').fill('Nota fuente corregida.');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Necesita regeneración')).toBeVisible();
  await settleClinicalItem(page, page.getByRole('article', { name: 'Evolución clínica' }));
  await expect(page.locator('[data-clinical-stage="draft"]')).toBeVisible();
  await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  await expect(page.getByText('Preparé un borrador para tu revisión.')).toHaveCount(1);

  await page.getByRole('button', { name: 'Revisar y guardar' }).click();
  await expect(liveArtifact).toHaveAttribute('data-clinical-stage', 'review');
  await expect(liveArtifact).toHaveAttribute('data-e2e-mounted', 'true');
  let confirmation = page.getByRole('dialog', { name: 'Guardar evolución' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText('Requiere confirmación')).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Guardar evolución' })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Volver a editar' }).click();
  await expect(confirmation).not.toBeVisible();
  await page.getByRole('button', { name: 'Editar Hallazgos' }).click();
  await page.getByRole('textbox', { name: 'Hallazgos' }).fill('Hallazgo final revisado.');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByRole('button', { name: 'Revisar y guardar' }).click();
  confirmation = page.getByRole('dialog', { name: 'Guardar evolución' });
  await confirmation.getByRole('button', { name: 'Guardar' }).click();
  const savedArtifact = page.locator('[data-artifact-id="draft-1"]');
  await expect(savedArtifact).toHaveAttribute('data-clinical-stage', 'saving');
  await expect(savedArtifact).toHaveAttribute('data-e2e-mounted', 'true');
  await expect(savedArtifact.getByText('Guardando…', { exact: true })).toBeVisible();
  await expect(savedArtifact.locator('.clinical-artifact-overflow')).toHaveCount(0);
  await expect(savedArtifact.locator('.clinical-artifact-terminal-actions')).toHaveCount(0);
  await expect(savedArtifact.locator('button.clinical-primary-button')).toHaveCount(0);
  await expect(savedArtifact.locator('button.clinical-secondary-button')).toHaveCount(0);
  await expect(savedArtifact).toHaveAttribute('data-clinical-stage', 'saved');
  await expect(savedArtifact).toHaveAttribute('data-e2e-mounted', 'true');
  await expect(savedArtifact.getByText('Guardada', { exact: true })).toBeVisible();
  await expect(savedArtifact.locator('.clinical-drive-row')).toHaveAttribute(
    'data-drive-export',
    'pending',
  );
  await expect(savedArtifact.getByRole('link', { name: /Ver en ficha/ })).toBeVisible();
  await expect(savedArtifact.getByRole('button', { name: 'Revisar y guardar' })).toHaveCount(0);
  await expect(savedArtifact.locator('.clinical-result, .clinical-receipt')).toHaveCount(0);
  await expect(page.locator('.clinical-artifact')).toHaveCount(1);
  await settleClinicalItem(page, savedArtifact);
  await expect(savedArtifact).toHaveCSS('border-radius', '12px');

  await composer.fill('Segundo control independiente.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(2);
  await expect(page.getByText('Preparé un borrador para tu revisión.')).toHaveCount(2);
  await settleClinicalItem(page, page.locator('[aria-label="Evolución clínica"]').last());
  await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Revisar y guardar' }).last().click();
  await expect(page.getByRole('dialog', { name: 'Guardar evolución' })).toBeVisible();

  await page.route('**/api/conversations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.goto('/chat');
  await expect(page.getByLabel('Pregunta sobre la biblioteca de videos')).toBeVisible();
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/a/${threadId}`);
  await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(2);
  await expect(page.locator('[data-clinical-stage="saved"]')).toHaveCount(1);
  await expect(page.getByText('Guardado pendiente')).toBeVisible();

  await page.reload();
  await expect(page.locator('[aria-label="Evolución clínica"]')).toHaveCount(2);
  await expect(page.locator('[data-clinical-stage="saved"]')).toHaveCount(1);
  await expect(page.getByText('Guardado pendiente')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await settleClinicalItem(page, page.getByText('Guardado pendiente'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('clinical Drive export failure stays recoverable without changing the artifact', async ({
  page,
}) => {
  const history = Array.from(
    { length: 10 },
    (_, index): MockMessage => ({
      id: `drive-history-${index}`,
      turn_id: `drive-history-turn-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Historial antes de sincronización ${index} `.repeat(16),
      created_at: `2026-01-15T12:${String(index + 4).padStart(2, '0')}:00Z`,
    }),
  );
  const state = thread(
    [
      approval({
        created_at: '2026-01-15T12:00:00Z',
        drive_export: { status: 'failed', error_code: 'DRIVE_WRITE_FAILED', journal },
      }),
    ],
    { artifacts: [hydratedArtifact({ status: 'approved' })], messages: history },
  );
  let releaseRetry!: () => void;
  let retryStarted!: () => void;
  const retryRequest = new Promise<void>((resolve) => {
    retryStarted = resolve;
  });
  const harness = await setupClinicalHarness(page, state, {
    driveRetry: async () => {
      retryStarted();
      await new Promise<void>((resolve) => {
        releaseRetry = resolve;
      });
      return { status: 'synced', journal };
    },
  });
  const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
  await expect(artifact).toHaveAttribute('data-clinical-stage', 'saved');
  await expect(artifact.locator('[data-drive-export="failed"]')).toContainText(
    'No se pudo guardar en Drive',
  );
  await expect(artifact.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(artifact.getByRole('button', { name: 'Verificar' })).toHaveCount(0);
  const transcript = page.locator('.clinical-transcript');
  await transcript.evaluate((element) => {
    const transcriptElement = element as HTMLDivElement;
    transcriptElement.scrollTop = 0;
    transcriptElement.dispatchEvent(new Event('scroll'));
  });
  const transcriptPosition = await transcript.evaluate((element) => element.scrollTop);
  const retryButton = artifact.getByRole('button', { name: 'Reintentar' });
  await expect(retryButton).toBeVisible();
  await retryButton.click({ force: true });
  await retryRequest;
  expect(await transcript.evaluate((element) => element.scrollTop)).toBe(transcriptPosition);
  releaseRetry();
  await expect(artifact.locator('[data-drive-export="synced"]')).toContainText('Guardado en Drive');
  expect(harness.driveRetries()).toBe(1);
  expect(await transcript.evaluate((element) => element.scrollTop)).toBe(transcriptPosition);
  await expect(page.locator('.clinical-artifact')).toHaveCount(1);
  await expect(page.locator('.clinical-result, .clinical-receipt')).toHaveCount(0);
});

test('clinical review exposes primary confirmation and secondary editing actions', async ({
  page,
}) => {
  const pending = approval({
    status: 'pending',
    drive_export: null,
  });
  const state = thread([pending], {
    artifacts: [hydratedArtifact({ status: 'pending' })],
    pending_action: pending,
    pending_action_patient: patient,
  });
  await setupClinicalHarness(page, state);
  const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
  await expect(artifact).toHaveAttribute('data-clinical-stage', 'review');
  await expect(artifact.getByRole('button', { name: 'Confirmar guardado' })).toBeVisible();
  await expect(artifact.getByRole('button', { name: 'Seguir editando' })).toBeVisible();
  await expect(artifact.locator('.clinical-artifact-overflow summary')).toBeVisible();
  await expect(artifact.getByRole('button', { name: 'Revisar y guardar' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('assistant-review-desktop.png', {
    animations: 'disabled',
  });
});

test('saved evolution distinguishes clinical save from Drive synchronization', async ({ page }) => {
  const state = thread([approval({ drive_export: { status: 'synced', journal } })], {
    artifacts: [hydratedArtifact({ status: 'approved' })],
  });
  await setupClinicalHarness(page, state);
  const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
  await expect(artifact).toHaveAttribute('data-clinical-stage', 'saved');
  await expect(artifact.getByText('Guardada en ficha')).toBeVisible();
  await expect(artifact.getByText('Guardado en Drive')).toBeVisible();
  await expect(artifact.getByRole('link', { name: 'Ver en ficha' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('assistant-saved-desktop.png', {
    animations: 'disabled',
  });
});

for (const connection of [
  {
    name: 'disconnected',
    status: { configured: true, status: 'disconnected' },
    heading: 'Conecta Google Drive',
    action: 'Conectar Google Drive',
  },
  {
    name: 'revoked',
    status: { configured: true, status: 'revoked' },
    heading: 'Vuelve a conectar Google Drive',
    action: 'Reconectar',
  },
] as const) {
  test(`clinical Drive ${connection.name} preserves canonical approval`, async ({ page }) => {
    const state = thread(
      [
        approval({
          drive_export: {
            status: 'failed',
            error_code: 'DRIVE_CONNECTION_REQUIRED',
            journal,
          },
        }),
      ],
      { artifacts: [hydratedArtifact({ status: 'approved' })] },
    );
    const harness = await setupClinicalHarness(page, state, { driveStatus: connection.status });
    const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
    await expect(artifact.locator('[data-drive-export="failed"]')).toContainText(
      'Drive necesita reconexión',
    );
    await expect(artifact.getByRole('button', { name: 'Reconectar' })).toBeVisible();
    await expect(artifact.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir Google Drive' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await artifact.getByRole('button', { name: 'Reconectar' }).click();
    await expect(
      page.getByRole('region', { name: 'Espacio de documentos de Google Drive' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: connection.heading })).toBeVisible();
    await expect(
      page.getByTestId('accessory').getByRole('button', { name: connection.action }),
    ).toBeVisible();
    if (connection.name === 'disconnected') {
      await expectNoHorizontalOverflow(page);
      await expect(page.getByTestId('accessory')).toHaveScreenshot(
        'drive-disconnected-desktop.png',
        {
          animations: 'disabled',
        },
      );
    }
    expect(harness.driveRetries()).toBe(0);
  });
}

test('clinical hydration recovers process-loss export once and keeps refresh parity', async ({
  page,
}) => {
  let releaseRecovery!: (value: Record<string, unknown>) => void;
  const recovery = new Promise<Record<string, unknown>>((resolve) => {
    releaseRecovery = resolve;
  });
  const state = thread([approval({ drive_export: { status: 'pending', journal } })], {
    artifacts: [hydratedArtifact({ status: 'approved' })],
  });
  const harness = await setupClinicalHarness(page, state, {
    driveRetry: async () => recovery,
  });
  const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
  await expect(artifact.locator('[data-drive-export="pending"]')).toContainText(
    'Pendiente de sincronización',
  );
  expect(harness.driveRetries()).toBe(1);
  await expect(page.locator('.clinical-artifact')).toHaveCount(1);
  await expect(page.locator('.clinical-result, .clinical-receipt')).toHaveCount(0);

  releaseRecovery({ status: 'synced', journal });
  await expect(artifact.locator('[data-drive-export="synced"]')).toContainText('Guardado en Drive');
  await expect(artifact).toHaveAttribute('data-clinical-stage', 'saved');
  await page.reload();
  await expect(page.locator('[data-artifact-id="draft-hydrated"]')).toHaveAttribute(
    'data-clinical-stage',
    'saved',
  );
  await expect(page.locator('.clinical-artifact')).toHaveCount(1);
  await expect(page.locator('.clinical-result, .clinical-receipt')).toHaveCount(0);
});

test('clinical artifact deep link reads edited remote journal and preserves transcript position', async ({
  page,
}) => {
  const state = thread([approval({ drive_export: { status: 'synced', journal } })], {
    artifacts: [hydratedArtifact({ status: 'approved' })],
  });
  await setupClinicalHarness(page, state);
  const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
  const transcript = page.locator('.clinical-transcript');
  const transcriptPosition = await transcript.evaluate((element) => element.scrollTop);
  await artifact.getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByRole('button', { name: 'Diarios', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: journal.display_name })).toBeVisible();
  await expect(page.getByText('Parte 1')).toHaveCount(0);
  await expect(page.getByText('Edición remota confirmada en Drive.')).toBeVisible();
  const entry = page.locator(`[data-evolution-id="${evolutionId}"]`);
  await expect(entry).toHaveAttribute('tabindex', '-1');
  await expect(entry).toHaveClass(/drive-journal-entry--highlighted/);
  await expect(entry).toBeFocused();
  await expect(page.getByText(/Actualizado/)).toBeVisible();
  expect(await transcript.evaluate((element) => element.scrollTop)).toBe(transcriptPosition);
  await expect(page.locator('.clinical-artifact')).toHaveCount(1);
  expect(await transcript.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
});

test('clinical streaming keeps history anchored and offers jump for large artifacts', async ({
  page,
}) => {
  const history = Array.from(
    { length: 12 },
    (_, index): MockMessage => ({
      id: `history-${index}`,
      turn_id: `history-turn-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Registro clínico anterior ${index} `.repeat(18),
      created_at: `2026-01-15T10:${String(index).padStart(2, '0')}:00Z`,
    }),
  );
  const initial = thread([], { messages: history });
  let releaseStream!: () => void;
  let routeEntered!: () => void;
  const streamEntered = new Promise<void>((resolve) => {
    routeEntered = resolve;
  });
  await page.route(`**/api/clinical-threads/${threadId}/turns`, async (route) => {
    const body = route.request().postDataJSON() as { turn_id: string; content: string };
    routeEntered();
    await new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const largeDraft = {
      ...draft,
      findings: 'Hallazgo extenso. '.repeat(700),
      assessment: 'Evaluación extensa. '.repeat(500),
    };
    const artifact = hydratedArtifact({
      id: 'draft-large',
      turn_id: body.turn_id,
      source_note: body.content,
      draft: largeDraft,
      generated_draft: largeDraft,
    });
    harness.setThread({
      ...initial,
      messages: [
        ...history,
        {
          id: `user-${body.turn_id}`,
          turn_id: body.turn_id,
          role: 'user',
          content: body.content,
          created_at: '2026-01-15T12:01:00Z',
        },
        {
          id: `assistant-${body.turn_id}`,
          turn_id: body.turn_id,
          role: 'assistant',
          content: 'Respuesta extensa disponible.',
          created_at: '2026-01-15T12:01:01Z',
        },
      ],
      artifacts: [artifact],
    });
    const payload = [
      sseEvent(
        'turn.started',
        1,
        body.turn_id,
        `turn-${body.turn_id}`,
        'turn',
        {
          user_content: body.content,
        },
        'running',
      ),
      sseEvent(
        'item.started',
        2,
        body.turn_id,
        `activity-${body.turn_id}`,
        'activity',
        { label: 'Preparando borrador' },
        'running',
      ),
      sseEvent(
        'item.completed',
        3,
        body.turn_id,
        'draft-large',
        'clinical_draft',
        {
          draft: largeDraft,
          source_note: body.content,
          patient_id: patientId,
          evolution_at: '2026-01-15T12:01:00-03:00',
        },
        'completed',
      ),
      sseEvent(
        'item.completed',
        4,
        body.turn_id,
        `assistant-${body.turn_id}`,
        'assistant_message',
        { content: 'Respuesta extensa disponible.' },
        'completed',
      ),
      sseEvent(
        'turn.completed',
        5,
        body.turn_id,
        `complete-${body.turn_id}`,
        'turn',
        {},
        'completed',
      ),
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: payload });
  });
  const harness = await setupClinicalHarness(page, initial);
  const transcript = page.locator('.clinical-transcript');
  const composer = page.getByLabel('Nota clínica');
  await composer.fill('Nueva nota durante lectura histórica.');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await streamEntered;
  await expect(page.getByText('Pensando…')).toBeVisible();
  await transcript.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  const historyPosition = await transcript.evaluate((element) => element.scrollTop);
  releaseStream();
  await expect(page.getByRole('heading', { name: 'Evolución clínica' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ir al mensaje más reciente/ })).toBeVisible();
  expect(await transcript.evaluate((element) => element.scrollTop)).toBe(historyPosition);
  const largeArtifact = page.locator('[data-artifact-id="draft-large"]');
  await expect(largeArtifact).toBeVisible();
  expect(await largeArtifact.locator('.clinical-artifact-body').innerText()).toContain(
    'Hallazgo extenso.',
  );
  expect(await transcript.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  expect(await transcript.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: /Ir al mensaje más reciente/ }).click();
  await expect(page.getByRole('button', { name: /Ir al mensaje más reciente/ })).toHaveCount(0);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`clinical reduced-motion ${viewport.name} layout stays usable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = thread([], { artifacts: [hydratedArtifact()] });
    await setupClinicalHarness(page, state);
    const artifact = page.locator('[data-artifact-id="draft-hydrated"]');
    await expect(artifact.getByRole('button', { name: 'Revisar y guardar' })).toBeVisible();
    await expect(artifact.locator('.clinical-artifact-overflow summary')).toBeVisible();
    await expect(artifact).toHaveCSS('animation-name', 'none');
    if (viewport.width <= 640) {
      await expect(artifact.locator('.clinical-artifact-actions')).toHaveCSS(
        'flex-direction',
        'column',
      );
      expect(
        await artifact.locator('.clinical-artifact-overflow').evaluate((element) => {
          return element.getBoundingClientRect().width <= window.innerWidth;
        }),
      ).toBe(true);
    }
    await expect(page.getByRole('button', { name: 'Abrir Google Drive' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
    if (viewport.width <= 1024) {
      await expect(page.locator('.drive-sheet-content')).toBeVisible();
    } else {
      await expect(page.locator('.workspace-row')).toBeVisible();
      await expect(page.locator('.drive-sheet-content')).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page
        .locator('.clinical-transcript')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  });
}

test('locks clinical patient scope while handing off dictation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await mockGoogleBootstrap(page);
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
  await expect(page.getByRole('button', { name: 'Detener grabación' })).toBeVisible();
  const composer = page.getByTestId('clinical-composer');
  const voiceStatus = composer.locator('.voice-composer-status');
  await expect(composer).toHaveClass(/chat-composer--voice-layout/);
  const [composerBox, recordingStatusBox] = await Promise.all([
    composer.boundingBox(),
    voiceStatus.boundingBox(),
  ]);
  expect(composerBox).not.toBeNull();
  expect(recordingStatusBox).not.toBeNull();
  expect(recordingStatusBox?.x).toBeGreaterThanOrEqual(composerBox?.x ?? 0);
  expect((recordingStatusBox?.x ?? 0) + (recordingStatusBox?.width ?? 0)).toBeLessThanOrEqual(
    (composerBox?.x ?? 0) + (composerBox?.width ?? 0),
  );
  await expect(page.getByRole('button', { name: 'Seleccionar paciente activo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Quitar paciente activo' })).toBeDisabled();
  await expect(input).toBeEditable();
  await page.getByRole('button', { name: 'Detener grabación' }).click();

  await expect(input).toBeEditable();
  await expect(page.getByText('Transcribiendo dictado…')).toBeVisible();
  await expect(composer).toHaveClass(/chat-composer--voice-layout/);
  await expectNoHorizontalOverflow(page);
  await input.fill('Nota manual');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  releaseTranscription();
  await expect(input).toHaveValue('Texto dictado. Nota manual');
  await expect(page.getByText('Dictado añadido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seleccionar paciente activo' })).toBeEnabled();
});

test('reuses one empty conversation across concurrent browser tabs', async ({ page }) => {
  await page.goto('/');

  const acquisitions = await page.evaluate(async () => {
    const acquire = async () => {
      const response = await fetch('/api/conversations/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(`Conversation acquisition failed: ${response.status}`);
      return (await response.json()) as { conversation: { id: string } };
    };

    return Promise.all(Array.from({ length: 10 }, acquire));
  });

  expect(new Set(acquisitions.map(({ conversation }) => conversation.id)).size).toBe(1);
});
