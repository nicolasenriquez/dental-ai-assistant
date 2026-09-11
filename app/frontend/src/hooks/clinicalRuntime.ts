import type {
  ClinicalDraft,
  ClinicalPatient,
  ClinicalPendingAction,
  ClinicalTurnArtifact,
} from '../lib/api';

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
  artifactStatus?: ClinicalTurnArtifact['status'];
  draft: ClinicalDraft;
  baseline: ClinicalDraft;
  sourceNote: string;
  edited: boolean;
  stale: boolean;
  patientId: string;
  evolutionAt: string;
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

export function artifactToDraftItem(artifact: ClinicalTurnArtifact): ClinicalDraftItem {
  return {
    id: artifact.id,
    turnId: artifact.turn_id,
    status:
      artifact.status === 'pending'
        ? 'pending'
        : artifact.status === 'failed'
          ? 'failed'
          : 'completed',
    createdAt: artifact.created_at,
    type: 'draft',
    artifactStatus: artifact.status,
    draft: artifact.draft,
    baseline: artifact.generated_draft,
    sourceNote: artifact.source_note,
    edited: JSON.stringify(artifact.draft) !== JSON.stringify(artifact.generated_draft),
    stale: artifact.status === 'stale',
    patientId: artifact.patient_id,
    evolutionAt: artifact.evolution_at,
  };
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

export type ClinicalRuntime =
  | 'idle'
  | 'streaming'
  | 'stopping'
  | 'awaiting_approval'
  | 'saving'
  | 'failed';

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

function isClinicalDraftData(data: Record<string, unknown>): boolean {
  if (
    !isRecord(data.draft) ||
    !nonEmptyString(data.patient_id) ||
    !nonEmptyString(data.evolution_at)
  )
    return false;
  const draft = data.draft;
  const fields = ['context', 'findings', 'assessment', 'treatment', 'follow_up'];
  if (!fields.every((field) => typeof draft[field] === 'string')) return false;
  return (
    Array.isArray(draft.review_flags) &&
    draft.review_flags.every(
      (flag) => isRecord(flag) && nonEmptyString(flag.source_text) && nonEmptyString(flag.reason),
    )
  );
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
  if (
    !nonEmptyString(parsed.event_id) ||
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    sequence < 1
  ) {
    return null;
  }
  if (parsed.thread_id !== scope.threadId || parsed.turn_id !== scope.turnId) return null;
  if (!nonEmptyString(parsed.item_id) || !nonEmptyString(parsed.item_type)) return null;
  if (!isRecord(parsed.data)) return null;
  if (parsed.item_type === 'clinical_draft' && !isClinicalDraftData(parsed.data)) return null;
  const status = parsed.status;
  if (
    status !== null &&
    status !== undefined &&
    (!nonEmptyString(status) || !VALID_STATUSES.has(status as ClinicalItemStatus))
  ) {
    return null;
  }
  const dataStatus = parsed.data.status;
  if (
    dataStatus !== null &&
    dataStatus !== undefined &&
    (!nonEmptyString(dataStatus) || !VALID_STATUSES.has(dataStatus as ClinicalItemStatus))
  ) {
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
    status: status === undefined || status === null ? null : (status as ClinicalItemStatus),
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
  | { type: 'updateDate'; itemId: string; evolutionAt: string }
  | { type: 'replaceDraft'; itemId: string; draft: ClinicalDraft }
  | { type: 'upsertApproval'; item: ClinicalApprovalItem }
  | { type: 'resolveApproval'; itemId: string; status: ClinicalItemStatus }
  | { type: 'returnToEditing'; approvalId: string; artifactId: string | null };

export function createClinicalReducerState(
  items: ClinicalTranscriptItem[] = [],
): ClinicalReducerState {
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
  // The backend deliberately keeps the same item id while the draft activity
  // becomes the reviewable artifact. That is the only valid type transition.
  if (current.type !== incoming.type) {
    if (current.type === 'activity' && incoming.type === 'draft') {
      return items.map((item, itemIndex) => (itemIndex === index ? incoming : item));
    }
    return items;
  }
  if (terminalStatuses.has(current.status)) return items;
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...incoming } : item));
}

function itemFromEvent(event: ClinicalEvent): ClinicalTranscriptItem | null {
  const createdAt =
    typeof event.data.created_at === 'string' ? event.data.created_at : new Date().toISOString();
  const status =
    event.status ?? (event.data.status as ClinicalItemStatus | undefined) ?? 'completed';
  if (event.itemType === 'assistant_message' && typeof event.data.content === 'string') {
    return {
      id: event.itemId,
      turnId: event.turnId,
      status: 'completed',
      createdAt,
      type: 'assistant',
      content: event.data.content,
    };
  }
  if (event.itemType === 'activity' && typeof event.data.label === 'string') {
    return {
      id: event.itemId,
      turnId: event.turnId,
      status,
      createdAt,
      type: 'activity',
      label: event.data.label,
    };
  }
  if (event.itemType === 'clinical_draft' && isRecord(event.data.draft)) {
    const draft = event.data.draft as unknown as ClinicalDraft;
    if (
      typeof draft.context !== 'string' ||
      typeof draft.findings !== 'string' ||
      typeof draft.assessment !== 'string' ||
      typeof draft.treatment !== 'string' ||
      typeof draft.follow_up !== 'string' ||
      !Array.isArray(draft.review_flags) ||
      !draft.review_flags.every(
        (flag) =>
          isRecord(flag) && typeof flag.source_text === 'string' && typeof flag.reason === 'string',
      )
    )
      return null;
    const sourceNote = typeof event.data.source_note === 'string' ? event.data.source_note : '';
    const patientId = typeof event.data.patient_id === 'string' ? event.data.patient_id : '';
    const evolutionAt =
      typeof event.data.evolution_at === 'string' ? event.data.evolution_at : createdAt;
    if (!patientId) return null;
    return {
      id: event.itemId,
      turnId: event.turnId,
      status: 'completed',
      createdAt,
      type: 'draft',
      artifactStatus: 'draft',
      draft,
      baseline: draft,
      sourceNote,
      edited: false,
      stale: false,
      patientId,
      evolutionAt,
    };
  }
  return null;
}

export function classifyClinicalDecodeFailure(
  name: string,
  raw: string,
): 'critical' | 'optional' | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.item_type === 'clinical_draft') return 'critical';
    return name.startsWith('turn.') ? 'critical' : 'optional';
  } catch {
    return name.startsWith('turn.') ? 'critical' : 'optional';
  }
}

export function clinicalReducer(
  state: ClinicalReducerState,
  action: ClinicalReducerAction,
): ClinicalReducerState {
  if (action.type === 'reset') return createClinicalReducerState(action.items);
  if (action.type === 'append')
    return { ...state, items: upsertStreamItem(state.items, action.item) };
  if (action.type === 'upsertApproval')
    return { ...state, items: upsertStreamItem(state.items, action.item) };
  if (action.type === 'resolveApproval') {
    return {
      ...state,
      items: state.items.map((item) =>
        item.id === action.itemId && item.type === 'approval' && !terminalStatuses.has(item.status)
          ? { ...item, status: action.status }
          : item,
      ),
    };
  }
  if (action.type === 'returnToEditing') {
    return {
      ...state,
      items: state.items
        .filter((item) => item.id !== action.approvalId)
        .map((item) =>
          item.type === 'draft' && item.id === action.artifactId
            ? { ...item, status: 'completed' as const, artifactStatus: 'draft' as const }
            : item,
        ),
    };
  }
  if (action.type === 'updateDraft') {
    return {
      ...state,
      items: state.items.map((item) =>
        item.id === action.itemId && item.type === 'draft'
          ? {
              ...item,
              draft: action.draft,
              edited: JSON.stringify(action.draft) !== JSON.stringify(item.baseline),
            }
          : item,
      ),
    };
  }
  if (action.type === 'updateSource') {
    return {
      ...state,
      items: state.items.map((item) =>
        item.id === action.itemId && item.type === 'draft'
          ? { ...item, sourceNote: action.sourceNote, stale: true }
          : item,
      ),
    };
  }
  if (action.type === 'replaceDraft') {
    return {
      ...state,
      items: state.items.map((item) =>
        item.id === action.itemId && item.type === 'draft'
          ? { ...item, draft: action.draft, baseline: action.draft, edited: false, stale: false }
          : item,
      ),
    };
  }
  if (action.type === 'updateDate') {
    return {
      ...state,
      items: state.items.map((item) =>
        item.id === action.itemId && item.type === 'draft'
          ? { ...item, evolutionAt: action.evolutionAt }
          : item,
      ),
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
