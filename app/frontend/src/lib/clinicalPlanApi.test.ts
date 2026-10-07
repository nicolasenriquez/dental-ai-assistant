import { afterEach, expect, it, vi } from 'vitest';
import {
  ApiError,
  addClinicalPlanItem,
  executeClinicalPlanStage,
  transitionClinicalPlan,
} from './api';

afterEach(() => vi.unstubAllGlobals());
it('sends one selected session with optional treatment note and no client-derived state', async () => {
  const body = {
    operation_id: 'operation',
    expected_revision: 4,
    clinical_note_body: 'Nota explícita',
  };
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await executeClinicalPlanStage('patient', 'plan', 'item', 'first-stage', {
    action: 'complete',
    body,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(
    '/api/patients/patient/clinical-plans/plan/items/item/stages/first-stage/complete',
  );
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify(body));
});
it('posts exactly one atomic planned aggregate and keeps operation identity on retry', async () => {
  const command = {
    operation_id: 'operation',
    expected_revision: 4,
    id: 'item',
    treatment: {
      id: 'procedure',
      variant_id: 'ORTO-BRACK',
      dentition: 'permanent' as const,
      teeth: [{ tooth_fdi: 16, role: 'tooth' as const, surfaces: [] }],
    },
    stages: [{ label: 'Preparación' }, { label: 'Colocación' }],
  };
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await addClinicalPlanItem('patient', 'plan', command);
  fetch.mockResolvedValue(new Response('{}', { status: 200 }));
  await addClinicalPlanItem('patient', 'plan', command);
  expect(fetch.mock.calls[0][0]).toBe('/api/patients/patient/clinical-plans/plan/items');
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify(command));
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
});
it('exposes only authorized conflict snapshot from lifecycle transport', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: 'revision_conflict',
            latest: { id: 'plan', revision: 7, state: 'closed' },
          },
        }),
        { status: 409 },
      ),
    ),
  );
  try {
    await transitionClinicalPlan('patient', 'plan', {
      action: 'accept',
      body: { operation_id: 'operation', expected_revision: 6, note: 'Aceptación manual' },
    });
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).body).toMatchObject({ detail: { latest: { revision: 7 } } });
  }
});
