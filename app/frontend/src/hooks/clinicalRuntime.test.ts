import { describe, expect, it } from 'vitest';
import type { ClinicalPendingAction } from '../lib/api';
import {
  type ClinicalApprovalItem,
  classifyClinicalDecodeFailure,
  clinicalReducer,
  createClinicalReducerState,
  decodeClinicalEvent,
} from './clinicalRuntime';

const action = (
  id: string,
  turnId: string,
  status: ClinicalPendingAction['status'],
): ClinicalApprovalItem => ({
  id,
  turnId,
  status: status === 'pending' ? 'pending' : status === 'declined' ? 'declined' : 'completed',
  createdAt: '2026-09-08T12:00:00Z',
  type: 'approval',
  action: {
    id,
    thread_id: 'thread-1',
    turn_id: turnId,
    patient_id: 'patient-1',
    action_type: 'save_evolution',
    proposal_payload: {
      evolution_id: `evolution-${id}`,
      patient_id: 'patient-1',
      evolution_at: '2026-09-08T12:00:00Z',
      raw_note: `Nota ${id}`,
      generated_text: `Generado ${id}`,
      final_text: `Final ${id}`,
    },
    proposal_hash: 'a'.repeat(64),
    status,
    expires_at: '2026-09-08T13:00:00Z',
    created_at: '2026-09-08T12:00:00Z',
    patient: {
      id: 'patient-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      rut_masked: '••.•••.678-5',
    },
  },
  patient: {
    id: 'patient-1',
    first_name: 'Ana',
    last_name: 'Pérez',
    rut_masked: '••.•••.678-5',
  },
});

function event(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: 1,
    event_id: 'event-1',
    sequence: 1,
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    item_id: 'item-1',
    item_type: 'activity',
    status: 'completed',
    data: { created_at: '2026-09-08T12:00:00Z', label: 'Listo' },
    ...overrides,
  });
}

describe('clinical runtime', () => {
  it('morphs a running draft activity into the live artifact with the same item id', () => {
    const started = decodeClinicalEvent(
      'item.started',
      event({
        item_type: 'activity',
        status: 'running',
        data: { created_at: '2026-09-08T12:00:00Z', label: 'Preparando borrador' },
      }),
      { threadId: 'thread-1', turnId: 'turn-1' },
    );
    const completed = decodeClinicalEvent(
      'item.completed',
      event({
        event_id: 'event-2',
        sequence: 2,
        item_type: 'clinical_draft',
        status: 'completed',
        data: {
          created_at: '2026-09-08T12:00:01Z',
          patient_id: 'patient-1',
          evolution_at: '2026-09-08T12:00:00Z',
          source_note: 'Control preventivo',
          draft: {
            context: 'Control',
            findings: 'Sin hallazgos',
            assessment: 'Estable',
            treatment: 'Mantener higiene',
            follow_up: 'Control en seis meses',
            review_flags: [],
          },
        },
      }),
      { threadId: 'thread-1', turnId: 'turn-1' },
    );
    if (!started || !completed) throw new Error('expected valid clinical events');

    let state = clinicalReducer(createClinicalReducerState(), { type: 'event', event: started });
    state = clinicalReducer(state, { type: 'event', event: completed });

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      id: 'item-1',
      type: 'draft',
      artifactStatus: 'draft',
    });
  });

  it('updates the existing draft artifact instead of adding another card', () => {
    const first = decodeClinicalEvent(
      'item.completed',
      event({
        item_type: 'clinical_draft',
        data: {
          patient_id: 'patient-1',
          evolution_at: '2026-09-08T12:00:00Z',
          source_note: 'Control',
          draft: {
            context: 'Control',
            findings: '',
            assessment: '',
            treatment: 'Texto largo',
            follow_up: 'Cuatro semanas',
            review_flags: [],
          },
        },
      }),
      { threadId: 'thread-1', turnId: 'turn-1' },
    );
    const updated = decodeClinicalEvent(
      'item.completed',
      event({
        event_id: 'event-2',
        sequence: 2,
        turn_id: 'turn-2',
        item_type: 'clinical_draft',
        data: {
          patient_id: 'patient-1',
          evolution_at: '2026-09-08T12:00:00Z',
          source_note: 'Control',
          draft: {
            context: 'Control',
            findings: '',
            assessment: '',
            treatment: 'Texto breve',
            follow_up: 'Cuatro semanas',
            review_flags: [],
          },
          generated_draft: {
            context: 'Control',
            findings: '',
            assessment: '',
            treatment: 'Texto largo',
            follow_up: 'Cuatro semanas',
            review_flags: [],
          },
        },
      }),
      { threadId: 'thread-1', turnId: 'turn-2' },
    );
    if (!first || !updated) throw new Error('expected valid draft events');

    let state = clinicalReducer(createClinicalReducerState(), { type: 'event', event: first });
    state = clinicalReducer(state, { type: 'event', event: updated });

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      type: 'draft',
      turnId: 'turn-1',
      edited: true,
      draft: { treatment: 'Texto breve' },
    });
  });

  it('rejects malformed or foreign events before state changes', () => {
    expect(
      decodeClinicalEvent('item.completed', event({ thread_id: 'other-thread' }), {
        threadId: 'thread-1',
        turnId: 'turn-1',
      }),
    ).toBeNull();
    expect(
      decodeClinicalEvent('item.completed', event({ item_id: '' }), {
        threadId: 'thread-1',
        turnId: 'turn-1',
      }),
    ).toBeNull();
    expect(
      decodeClinicalEvent('item.completed', event({ schema_version: 2 }), {
        threadId: 'thread-1',
        turnId: 'turn-1',
      }),
    ).toBeNull();
  });

  it('treats a malformed clinical draft as a visible critical failure', () => {
    const malformedDraft = event({
      item_type: 'clinical_draft',
      data: { source_note: 'Nota original' },
    });
    expect(
      decodeClinicalEvent('item.completed', malformedDraft, {
        threadId: 'thread-1',
        turnId: 'turn-1',
      }),
    ).toBeNull();
    expect(classifyClinicalDecodeFailure('item.completed', malformedDraft)).toBe('critical');
  });

  it('keeps one approval per action and does not replace history', () => {
    let state = createClinicalReducerState();
    state = clinicalReducer(state, {
      type: 'upsertApproval',
      item: action('action-a', 'turn-1', 'approved'),
    });
    state = clinicalReducer(state, {
      type: 'upsertApproval',
      item: action('action-b', 'turn-2', 'pending'),
    });
    expect(state.items.map((item) => item.id)).toEqual(['action-a', 'action-b']);

    state = clinicalReducer(state, {
      type: 'upsertApproval',
      item: action('action-a', 'turn-1', 'pending'),
    });
    expect(state.items.find((item) => item.id === 'action-a')?.status).toBe('completed');
  });

  it('merges live and recovered Drive state into the same approval item', () => {
    const approval = action('action-a', 'turn-1', 'pending');
    approval.action.result_resource_id = 'evolution-1';
    let state = createClinicalReducerState([approval]);
    const resolvedAction = {
      ...approval.action,
      status: 'approved' as const,
      drive_export: { status: 'pending' as const },
    };

    state = clinicalReducer(state, {
      type: 'resolveApproval',
      itemId: approval.id,
      status: 'completed',
      action: resolvedAction,
    });
    state = clinicalReducer(state, {
      type: 'updateDriveExport',
      evolutionId: 'evolution-1',
      driveExport: { status: 'synced', synced_at: '2026-09-08T12:01:00Z' },
    });

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      id: 'action-a',
      status: 'completed',
      action: { drive_export: { status: 'synced' } },
    });
  });

  it('drops duplicate and out-of-order events for the active turn', () => {
    const first = decodeClinicalEvent('item.completed', event(), {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    if (!first) throw new Error('expected a valid clinical event');
    let state = clinicalReducer(createClinicalReducerState(), { type: 'event', event: first });
    state = clinicalReducer(state, { type: 'event', event: first });
    const older = decodeClinicalEvent(
      'item.completed',
      event({ event_id: 'event-2', sequence: 0 }),
      { threadId: 'thread-1', turnId: 'turn-1' },
    );
    expect(older).toBeNull();
    expect(state.items).toHaveLength(1);
  });
});
