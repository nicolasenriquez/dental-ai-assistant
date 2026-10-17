import { afterEach, expect, it, vi } from 'vitest';
import {
  ApiError,
  createPatientTreatment,
  deletePatientCondition,
  deletePatientTreatment,
  getDentalClinicalNoteRevisions,
  getPatientTreatments,
  updatePatientTreatment,
} from './api';

afterEach(() => vi.unstubAllGlobals());

it('sends frozen operation and revision through existing typed transport', async () => {
  const fetch = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ operation_id: 'operation', committed: { id: 'record' } }), {
        status: 201,
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const body = {
    id: 'record',
    operation_id: 'operation',
    expected_revision: 0 as const,
    variant_id: 'ORTO-BRACK',
    dentition: 'permanent' as const,
    teeth: [{ tooth_fdi: 16, role: 'tooth' as const, surfaces: [] }],
  };
  await createPatientTreatment('patient', body);
  expect(fetch.mock.calls[0][0]).toBe('/api/patients/patient/dental-treatments');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
  await createPatientTreatment('patient', body);
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
  await getPatientTreatments('patient', { cursor: 'opaque', dentition: 'primary' });
  expect(fetch.mock.calls[2][0]).toContain('cursor=opaque');
});

it.each([
  [deletePatientCondition, 'conditions'],
  [deletePatientTreatment, 'dental-treatments'],
] as const)('sends exact delete identity through %s', async (remove, resource) => {
  const receipt = {
    operation_id: 'operation',
    resource_kind: resource === 'conditions' ? 'condition' : 'procedure',
    resource_id: 'record',
    action: 'deleted',
    revision: 2,
    revision_id: 'revision',
    deleted_at: '2026-10-17T12:00:00Z',
    actor: { user_id: 'owner', display_name: null },
  };
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(receipt), { status: 200 })),
    );
  vi.stubGlobal('fetch', fetch);
  const body = { operation_id: 'operation', expected_revision: 1 };
  expect(await remove('patient', 'record', body)).toEqual(receipt);
  expect(await remove('patient', 'record', body)).toEqual(receipt);
  expect(fetch.mock.calls[0][0]).toBe(`/api/patients/patient/${resource}/record/delete`);
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
});

it('preserves latest authorized snapshot in revision conflict', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { code: 'revision_conflict', latest: { revision: 2, note: 'Remote' } },
        }),
        { status: 409 },
      ),
    ),
  );
  await expect(
    updatePatientTreatment('patient', 'record', {
      operation_id: 'edit',
      expected_revision: 1,
      note: 'Local',
    }),
  ).rejects.toBeInstanceOf(ApiError);
});

it('keeps the supplied dental-note revision actor display name', async () => {
  const mockFetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [
          {
            id: 'revision',
            revision: 2,
            action: 'edited',
            changed_at: '2026-10-03T12:00:00Z',
            actor_user_id: '00000000-0000-4000-8000-000000000001',
            actor_display_name: 'Dra. Rojas',
          },
        ],
        total: 1,
        next_cursor: null,
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', mockFetch);
  const page = await getDentalClinicalNoteRevisions('patient', 'note');
  expect(mockFetch.mock.calls[0][0]).toBe(
    '/api/patients/patient/clinical-notes/note/revisions?limit=20',
  );
  expect(page.items[0].actor_display_name).toBe('Dra. Rojas');
});
