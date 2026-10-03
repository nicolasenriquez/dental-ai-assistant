import { type Page, expect, test } from '@playwright/test';
import type { ClinicalPendingAction, ClinicalThread, ClinicalTurnArtifact, EvolutionSummary } from '../src/lib/api';

const patientId = '22222222-2222-4222-8222-222222222222';
const threadId = '11111111-1111-4111-8111-111111111111';
const artifactId = '33333333-3333-4333-8333-333333333333';
const actionId = '44444444-4444-4444-8444-444444444444';
const evolutionId = '55555555-5555-4555-8555-555555555555';
const now = '2026-10-01T12:00:00Z';
const patient = { id: patientId, first_name: 'Camila', last_name: 'Soto', rut_masked: '••.•••.678-5', birth_date: '1992-01-01' };
const draft = { context: 'Control', findings: 'Sin dolor', assessment: '', treatment: '', follow_up: 'Control en seis meses', review_flags: [] };

async function installWorkspace(page: Page): Promise<{ saves: () => number; retries: () => number }> {
  const thread: ClinicalThread = { id: threadId, owner_user_id: 'owner', title: 'Camila Soto', active_patient: patient, pending_action_patient: null, active_turn_id: null, created_at: now, updated_at: now, messages: [], artifacts: [], pending_action: null, actions: [] };
  const evolutions: EvolutionSummary[] = [];
  let saves = 0;
  let retries = 0;
  let exportFailed = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/config') return json({ mode: 'local', drive_enabled: false, drive_auto_onboard: false });
    if (path === '/api/auth/me') return json({ id: 'owner', email: 'workspace@example.com', is_admin: false, messages_used_today: 0, messages_remaining_today: 25 });
    if (path === '/api/patients') return json([patient]);
    if (path === `/api/patients/${patientId}`) return json(patient);
    if (path === `/api/patients/${patientId}/evolutions`) return json(evolutions);
    if (path === `/api/evolutions/${evolutionId}`) return json({ ...evolutions[0], final_text: 'Hallazgos: Sin dolor' });
    if (path === '/api/conversations') return json([]);
    if (path === '/api/clinical-threads/open-context') return json({ resolution: 'reused', thread });
    if (path === '/api/clinical-threads/acquire') return json({ reused: true, thread });
    if (path === '/api/clinical-threads') return json([{ id: threadId, title: thread.title, active_patient_id: patientId, active_turn_id: null, updated_at: now, preview: null, approval_pending: Boolean(thread.pending_action) }]);
    if (path === `/api/clinical-threads/${threadId}`) return json(thread);
    if (path === `/api/clinical-threads/${threadId}/turns`) {
      const body = request.postDataJSON();
      const artifact: ClinicalTurnArtifact = { id: artifactId, owner_user_id: 'owner', thread_id: threadId, turn_id: body.turn_id, patient_id: patientId, artifact_type: 'clinical_draft', status: 'draft', source_note: body.content, generated_draft: draft, draft, evolution_at: now, created_at: now, updated_at: now, patient };
      thread.messages = [{ id: 'message-1', thread_id: threadId, turn_id: body.turn_id, role: 'user', content: body.content, created_at: now, turn_status: 'completed' }];
      thread.artifacts = [artifact];
      const event = (name: string, sequence: number, itemType: string, data: Record<string, unknown>) => `event: ${name}\ndata: ${JSON.stringify({ schema_version: 1, event_id: `event-${sequence}`, sequence, thread_id: threadId, turn_id: body.turn_id, item_id: artifactId, item_type: itemType, status: 'completed', data: { created_at: now, ...data } })}\n\n`;
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: event('item.completed', 1, 'clinical_draft', { patient_id: patientId, draft, source_note: body.content, evolution_at: now }) + event('turn.completed', 2, 'turn', {}) });
    }
    if (path === `/api/clinical-threads/${threadId}/artifacts/${artifactId}`) {
      const body = request.postDataJSON();
      thread.artifacts[0] = { ...thread.artifacts[0], ...body };
      return json(thread.artifacts[0]);
    }
    if (path === `/api/clinical-threads/${threadId}/prepare-save`) {
      const action: ClinicalPendingAction = { id: actionId, thread_id: threadId, turn_id: thread.artifacts[0].turn_id, artifact_id: artifactId, patient_id: patientId, action_type: 'save_evolution', proposal_payload: { evolution_id: evolutionId, patient_id: patientId, evolution_at: now, raw_note: thread.artifacts[0].source_note, generated_text: 'Sin dolor', final_text: 'Sin dolor' }, proposal_hash: 'a'.repeat(64), status: 'pending', expires_at: '2099-01-01T12:00:00Z', created_at: now, patient };
      thread.pending_action = action;
      thread.actions = [action];
      thread.artifacts[0].status = 'pending';
      return json(action);
    }
    if (path === `/api/clinical-actions/${actionId}/resolve`) {
      if (!saves) {
        saves += 1;
        evolutions.push({ id: evolutionId, patient_id: patientId, evolution_at: now, preview: 'Sin dolor', created_at: now });
      }
      exportFailed = true;
      const action = { ...thread.actions![0], status: 'approved' as const, result_resource_id: evolutionId, drive_export: { status: 'failed' as const } };
      thread.pending_action = null;
      thread.actions = [action];
      thread.artifacts[0].status = 'approved';
      return json(action);
    }
    if (path === '/api/clinical-pending-work') return json({ items: exportFailed ? [{ id: `drive:${evolutionId}`, kind: 'drive_export_failed', patient: { id: patientId, display_name: 'Camila Soto', rut_masked: patient.rut_masked }, updated_at: now, action: { kind: 'retry_drive_export', evolution_id: evolutionId, thread_id: threadId } }] : [], total: exportFailed ? 1 : 0, next_cursor: null });
    if (path.endsWith('/drive-export/retry')) { retries += 1; exportFailed = false; return json({ drive_export: { status: 'synced' } }); }
    if (path === '/api/google-drive/status') return json({ configured: false, status: 'unconfigured' });
    return json({ detail: 'Unexpected mocked route' }, 404);
  });
  return { saves: () => saves, retries: () => retries };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 834, height: 1112 }, { width: 390, height: 844 }]) {
  test(`contextual assistant preserves composer and focus at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installWorkspace(page);
    await page.goto(`/patients/${patientId}`);
    await expect(page.getByRole('region', { name: 'Resumen del paciente' })).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Asistente', exact: true });
    await trigger.click();
    const composer = page.getByRole('textbox', { name: 'Nota clínica' });
    await expect(composer).toBeVisible();
    await composer.fill('Control sin dolor, aún sin enviar');
    if (viewport.width < 768) {
      await expect(page).toHaveURL(`/a/${threadId}`);
      await page.getByRole('link', { name: 'Volver a ficha', exact: false }).click();
      await trigger.click();
    } else {
      await expect(page.getByRole('button', { name: 'Abrir Google Drive' })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(page.getByRole('dialog')).toHaveCount(viewport.width < 1024 ? 1 : 0);
    }
    await expect(composer).toHaveValue('Control sin dolor, aún sin enviar');
    await expect(page.locator('body')).not.toContainText('Unexpected mocked route');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: test.info().outputPath(`workspace-${viewport.width}.png`), animations: 'disabled', fullPage: true });
  });
}

test('patient to reviewed evolution to ficha and pending Drive recovery', async ({ page }) => {
  const evidence = await installWorkspace(page);
  await page.goto(`/patients/${patientId}`);
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nota clínica' }).fill('Control sin dolor');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByRole('heading', { name: 'Evolución clínica', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir asistente completo' }).click();
  await expect(page).toHaveURL(`/a/${threadId}`);
  await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
  expect(evidence.saves()).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar evolución', exact: true }).click();
  await expect(page.getByText('Guardada en ficha', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver en ficha', exact: true }).click();
  await expect(page).toHaveURL(`/patients/${patientId}/evolutions/${evolutionId}`);
  await expect(page.getByRole('heading', { name: 'Evolución dental' })).toBeVisible();
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  await page.getByRole('link', { name: 'Abrir asistente completo' }).click();
  await page.getByRole('button', { name: 'Pendientes', exact: true }).click();
  const pending = page.getByRole('region', { name: 'Trabajo pendiente' });
  await expect(pending).toContainText('Guardada en ficha');
  await pending.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(pending).toContainText('No hay trabajo pendiente');
  expect(evidence.saves()).toBe(1);
  expect(evidence.retries()).toBe(1);
});
