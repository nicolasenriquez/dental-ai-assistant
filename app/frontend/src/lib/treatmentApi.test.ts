import { afterEach, expect, it, vi } from 'vitest';
import {
  ApiError,
  createPatientTreatment,
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
