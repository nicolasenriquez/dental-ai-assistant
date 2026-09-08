import { describe, expect, it } from 'vitest';
import type { ClinicalPendingAction } from '../lib/api';
import {
  clinicalReducer,
  createClinicalReducerState,
  decodeClinicalEvent,
  type ClinicalApprovalItem,
} from './clinicalRuntime';

const action = (id: string, turnId: string, status: ClinicalPendingAction['status']): ClinicalApprovalItem => ({
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
  it('rejects malformed or foreign events before state changes', () => {
    expect(decodeClinicalEvent('item.completed', event({ thread_id: 'other-thread' }), { threadId: 'thread-1', turnId: 'turn-1' })).toBeNull();
    expect(decodeClinicalEvent('item.completed', event({ item_id: '' }), { threadId: 'thread-1', turnId: 'turn-1' })).toBeNull();
    expect(decodeClinicalEvent('item.completed', event({ schema_version: 2 }), { threadId: 'thread-1', turnId: 'turn-1' })).toBeNull();
  });

  it('keeps one approval per action and does not replace history', () => {
    let state = createClinicalReducerState();
    state = clinicalReducer(state, { type: 'upsertApproval', item: action('action-a', 'turn-1', 'approved') });
    state = clinicalReducer(state, { type: 'upsertApproval', item: action('action-b', 'turn-2', 'pending') });
    expect(state.items.map((item) => item.id)).toEqual(['action-a', 'action-b']);

    state = clinicalReducer(state, { type: 'upsertApproval', item: action('action-a', 'turn-1', 'pending') });
    expect(state.items.find((item) => item.id === 'action-a')?.status).toBe('completed');
  });

  it('drops duplicate and out-of-order events for the active turn', () => {
    const first = decodeClinicalEvent('item.completed', event(), { threadId: 'thread-1', turnId: 'turn-1' });
    expect(first).not.toBeNull();
    let state = clinicalReducer(createClinicalReducerState(), { type: 'event', event: first! });
    state = clinicalReducer(state, { type: 'event', event: first! });
    const older = decodeClinicalEvent('item.completed', event({ event_id: 'event-2', sequence: 0 }), { threadId: 'thread-1', turnId: 'turn-1' });
    expect(older).toBeNull();
    expect(state.items).toHaveLength(1);
  });
});
