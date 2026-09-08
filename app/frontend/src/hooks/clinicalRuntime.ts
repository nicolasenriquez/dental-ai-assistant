import type { ClinicalDraft, ClinicalPatient, ClinicalPendingAction } from '../lib/api';

export type ClinicalItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'declined';

export interface ClinicalBaseItem {
  id: string;
  turnId: string;
  status: ClinicalItemStatus;
  createdAt: string;
}

export interface ClinicalUserItem extends ClinicalBaseItem {
  type: 'user';
  content: string;
}

export interface ClinicalAssistantItem extends ClinicalBaseItem {
  type: 'assistant';
  content: string;
}

export interface ClinicalActivityItem extends ClinicalBaseItem {
  type: 'activity';
  label: string;
}

export interface ClinicalDraftItem extends ClinicalBaseItem {
  type: 'draft';
  draft: ClinicalDraft;
  baseline: ClinicalDraft;
  sourceNote: string;
  edited: boolean;
  stale: boolean;
}

export interface ClinicalApprovalItem extends ClinicalBaseItem {
  type: 'approval';
  action: ClinicalPendingAction;
  patient: ClinicalPatient;
}

export interface ClinicalResultItem extends ClinicalBaseItem {
  type: 'result';
  actionId?: string;
  message: string;
  evolutionId?: string | null;
  patientId?: string | null;
}

export interface ClinicalErrorItem extends ClinicalBaseItem {
  type: 'error';
  code: string;
  message: string;
}

export type ClinicalTranscriptItem =
  | ClinicalUserItem
  | ClinicalAssistantItem
  | ClinicalActivityItem
  | ClinicalDraftItem
  | ClinicalApprovalItem
  | ClinicalResultItem
  | ClinicalErrorItem;

export interface ClinicalPatientSwitch {
  current: ClinicalPatient;
  detected: ClinicalPatient;
}

export type ClinicalRuntime = 'idle' | 'streaming' | 'awaiting_approval' | 'saving' | 'failed';

export interface ClinicalEvent {
  name: string;
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  threadId: string;
  turnId: string;
  itemId: string;
  itemType: string;
  status: ClinicalItemStatus | null;
  data: Record<string, unknown>;
}

export interface ClinicalEventScope {
  threadId: string;
  turnId: string;
}

const VALID_STATUSES = new Set<ClinicalItemStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'declined',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function decodeClinicalEvent(
  name: string,
  raw: string,
  scope: ClinicalEventScope,
): ClinicalEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.schema_version !== 1) return null;
  const sequence = parsed.sequence;
  if (!nonEmptyString(parsed.event_id) || typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) {
    return null;
  }
  if (parsed.thread_id !== scope.threadId || parsed.turn_id !== scope.turnId) return null;
  if (!nonEmptyString(parsed.item_id) || !nonEmptyString(parsed.item_type)) return null;
  if (!isRecord(parsed.data)) return null;
  const status = parsed.status;
  if (status !== null && status !== undefined && (!nonEmptyString(status) || !VALID_STATUSES.has(status as ClinicalItemStatus))) {
    return null;
  }
  const dataStatus = parsed.data.status;
  if (dataStatus !== null && dataStatus !== undefined && (!nonEmptyString(dataStatus) || !VALID_STATUSES.has(dataStatus as ClinicalItemStatus))) {
    return null;
  }
  return {
    name,
    schemaVersion: 1,
    eventId: parsed.event_id,
    sequence,
    threadId: parsed.thread_id,
    turnId: parsed.turn_id,
    itemId: parsed.item_id,
    itemType: parsed.item_type,
    status: status === undefined || status === null ? null : status as ClinicalItemStatus,
    data: parsed.data,
  };
}

export interface ClinicalReducerState {
  items: ClinicalTranscriptItem[];
  activeTurnId: string | null;
  lastSequence: number;
  seenEventIds: ReadonlySet<string>;
}

export type ClinicalReducerAction =
  | { type: 'reset'; items: ClinicalTranscriptItem[] }
  | { type: 'event'; event: ClinicalEvent }
  | { type: 'append'; item: ClinicalTranscriptItem }
  | { type: 'updateDraft'; itemId: string; draft: ClinicalDraft }
  | { type: 'updateSource'; itemId: string; sourceNote: string }
  | { type: 'replaceDraft'; itemId: string; draft: ClinicalDraft }
  | { type: 'upsertApproval'; item: ClinicalApprovalItem }
  | { type: 'resolveApproval'; itemId: string; status: ClinicalItemStatus };

export function createClinicalReducerState(items: ClinicalTranscriptItem[] = []): ClinicalReducerState {
  return { items, activeTurnId: null, lastSequence: 0, seenEventIds: new Set() };
}

const terminalStatuses = new Set<ClinicalItemStatus>(['completed', 'declined', 'failed']);

function upsertStreamItem(
  items: ClinicalTranscriptItem[],
  incoming: ClinicalTranscriptItem,
): ClinicalTranscriptItem[] {
  const index = items.findIndex((item) => item.id === incoming.id);
  if (index < 0) return [...items, incoming];
  const current = items[index];
  if (current.type !== incoming.type) return items;
  if (terminalStatuses.has(current.status)) return items;
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...incoming } : item));
}

function itemFromEvent(event: ClinicalEvent): ClinicalTranscriptItem | null {
  const createdAt = typeof event.data.created_at === 'string' ? event.data.created_at : new Date().toISOString();
  const status = event.status ?? (event.data.status as ClinicalItemStatus | undefined) ?? 'completed';
  if (event.itemType === 'assistant_message' && typeof event.data.content === 'string') {
    return { id: event.itemId, turnId: event.turnId, status: 'completed', createdAt, type: 'assistant', content: event.data.content };
  }
  if (event.itemType === 'activity' && typeof event.data.label === 'string') {
    return { id: event.itemId, turnId: event.turnId, status, createdAt, type: 'activity', label: event.data.label };
  }
  if (event.itemType === 'clinical_draft' && isRecord(event.data.draft)) {
    const draft = event.data.draft as unknown as ClinicalDraft;
    if (typeof draft.context !== 'string' || typeof draft.findings !== 'string' || typeof draft.assessment !== 'string' || typeof draft.treatment !== 'string' || typeof draft.follow_up !== 'string' || !Array.isArray(draft.review_flags) || !draft.review_flags.every((flag) => isRecord(flag) && typeof flag.source_text === 'string' && typeof flag.reason === 'string')) return null;
    const sourceNote = typeof event.data.source_note === 'string' ? event.data.source_note : '';
    return { id: event.itemId, turnId: event.turnId, status: 'completed', createdAt, type: 'draft', draft, baseline: draft, sourceNote, edited: false, stale: false };
  }
  return null;
}

export function clinicalReducer(
  state: ClinicalReducerState,
  action: ClinicalReducerAction,
): ClinicalReducerState {
  if (action.type === 'reset') return createClinicalReducerState(action.items);
  if (action.type === 'append') return { ...state, items: upsertStreamItem(state.items, action.item) };
  if (action.type === 'upsertApproval') return { ...state, items: upsertStreamItem(state.items, action.item) };
  if (action.type === 'resolveApproval') {
    return {
      ...state,
      items: state.items.map((item) => (
        item.id === action.itemId && item.type === 'approval' && !terminalStatuses.has(item.status)
          ? { ...item, status: action.status }
          : item
      )),
    };
  }
  if (action.type === 'updateDraft') {
    return {
      ...state,
      items: state.items.map((item) => (
        item.id === action.itemId && item.type === 'draft'
          ? { ...item, draft: action.draft, edited: JSON.stringify(action.draft) !== JSON.stringify(item.baseline) }
          : item
      )),
    };
  }
  if (action.type === 'updateSource') {
    return {
      ...state,
      items: state.items.map((item) => (
        item.id === action.itemId && item.type === 'draft'
          ? { ...item, sourceNote: action.sourceNote, stale: true }
          : item
      )),
    };
  }
  if (action.type === 'replaceDraft') {
    return {
      ...state,
      items: state.items.map((item) => (
        item.id === action.itemId && item.type === 'draft'
          ? { ...item, draft: action.draft, baseline: action.draft, edited: false, stale: false }
          : item
      )),
    };
  }
  const sameTurn = state.activeTurnId === action.event.turnId;
  const lastSequence = sameTurn ? state.lastSequence : 0;
  const seenEventIds = new Set(sameTurn ? state.seenEventIds : []);
  if (seenEventIds.has(action.event.eventId) || action.event.sequence <= lastSequence) return state;
  seenEventIds.add(action.event.eventId);
  const item = itemFromEvent(action.event);
  return {
    items: item ? upsertStreamItem(state.items, item) : state.items,
    activeTurnId: action.event.turnId,
    lastSequence: action.event.sequence,
    seenEventIds,
  };
}
