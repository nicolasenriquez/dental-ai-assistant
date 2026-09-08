import { expect, test } from '@playwright/test';

const threadId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const actionId = '33333333-3333-4333-8333-333333333333';
const secondActionId = '33333333-3333-4333-8333-333333333334';
const evolutionId = '44444444-4444-4444-8444-444444444444';
type MockAction = Record<string, unknown>;

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
    messages: [],
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

test('clinical assistant preserves the complete two-turn review flow', async ({ page }) => {
  let turnCount = 0;
  let actionCount = 0;
  let threadState = thread();

  await page.route('**/api/auth/me', (route) => route.fulfill({
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
  }));
  await page.route('**/api/patients', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([patient]) }));
  await page.route('**/api/clinical-threads', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...threadState, preview: null, active_patient_id: patientId, approval_pending: Boolean(threadState.pending_action) }]) });
      return;
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(threadState) });
  });
  await page.route(`**/api/clinical-threads/${threadId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(threadState) }));
  await page.route(`**/api/clinical-threads/${threadId}/turns`, async (route) => {
    const body = route.request().postDataJSON() as { turn_id: string; content: string };
    turnCount += 1;
    const draftId = `draft-${turnCount}`;
    const assistantId = `assistant-${turnCount}`;
    const payload = [
      sseEvent('turn.started', 1, body.turn_id, `turn-${turnCount}`, 'turn', { user_content: body.content }, 'running'),
      sseEvent('item.completed', 2, body.turn_id, draftId, 'clinical_draft', { draft, source_note: body.content, created_at: '2026-01-15T12:01:00Z' }, 'completed'),
      sseEvent('item.completed', 3, body.turn_id, assistantId, 'assistant_message', { content: 'Preparé un borrador para tu revisión.', created_at: '2026-01-15T12:01:01Z' }, 'completed'),
      sseEvent('turn.completed', 4, body.turn_id, `complete-${turnCount}`, 'turn', {}, 'completed'),
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: payload });
  });
  await page.route(`**/api/clinical-threads/${threadId}/drafts`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(draft) }));
  await page.route(`**/api/clinical-threads/${threadId}/prepare-save`, async (route) => {
    const body = route.request().postDataJSON() as { turn_id: string; raw_note: string };
    actionCount += 1;
    const nextActionId = actionCount === 1 ? actionId : secondActionId;
    const action = {
      id: nextActionId,
      thread_id: threadId,
      turn_id: body.turn_id,
      patient_id: patientId,
      action_type: 'save_evolution',
      proposal_payload: { evolution_id: evolutionId, patient_id: patientId, evolution_at: '2026-01-15T12:00:00Z', raw_note: body.raw_note, generated_text: 'Generado', final_text: draft.findings },
      proposal_hash: 'a'.repeat(64),
      status: 'pending',
      expires_at: '2026-01-15T12:30:00Z',
      created_at: '2026-01-15T12:02:00Z',
      resolved_at: null,
      result_resource_id: null,
      patient,
    };
    threadState = thread([...threadState.actions, action]);
    threadState.pending_action = action;
    threadState.pending_action_patient = patient;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action) });
  });
  await page.route('**/api/clinical-actions/*/resolve', async (route) => {
    const decision = (route.request().postDataJSON() as { decision: string }).decision;
    const resolvedId = route.request().url().split('/').slice(-2, -1)[0];
    const current = threadState.actions.find((candidate) => candidate.id === resolvedId) ?? threadState.actions[0];
    const resolved = { ...current, status: decision === 'decline' ? 'declined' : 'approved', result_resource_id: evolutionId, resolved_at: '2026-01-15T12:03:00Z' };
    threadState = thread(threadState.actions.map((candidate) => candidate.id === resolvedId ? resolved : candidate));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resolved) });
  });

  await page.goto(`/a/${threadId}`);
  await expect(page.getByRole('heading', { name: 'Asistente clínico' })).toBeVisible();
  await page.screenshot({ path: 'test-results/clinical-empty.png', fullPage: true });

  const composer = page.getByLabel('Nota clínica');
  await composer.fill('Control preventivo sin hallazgos nuevos.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evolución propuesta' })).toBeVisible();
  await page.screenshot({ path: 'test-results/clinical-draft.png', fullPage: true });

  await page.getByRole('button', { name: 'Editar nota fuente' }).click();
  await page.getByLabel('Editar nota clínica original').fill('Nota fuente corregida.');
  await expect(page.getByText('Necesita regeneración')).toBeVisible();
  await page.screenshot({ path: 'test-results/clinical-editing.png', fullPage: true });
  await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
  await expect(page.getByText('Borrador asistido')).toBeVisible();

  await page.getByRole('button', { name: 'Preparar para guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Antes de guardar' })).toBeVisible();
  await page.screenshot({ path: 'test-results/clinical-approval-pending.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Evolución guardada' })).toBeVisible();
  await page.screenshot({ path: 'test-results/clinical-approval-resolved.png', fullPage: true });

  await composer.fill('Segundo control independiente.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.locator('[aria-label="Evolución propuesta"]')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/clinical-second-turn.png', fullPage: true });
  await page.getByRole('button', { name: 'Preparar para guardar' }).last().click();
  await expect(page.getByRole('heading', { name: 'Antes de guardar' })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/clinical-second-approval.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/clinical-mobile.png', fullPage: true });
});
