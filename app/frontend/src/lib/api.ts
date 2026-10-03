/**
 * Typed fetch wrappers for the RAG YouTube Chat API.
 */

const BASE = '/api';

/**
 * Thrown when POST /api/conversations/{id}/messages returns 429.
 * Carries the shape of the rate_limit_exceeded JSON body so the chat UI
 * can render a friendly "daily limit hit, resets at HH:MM" message.
 * MISSION §10 invariant #1 is the governing cap (25/24h, hardcoded).
 */
export class RateLimitError extends Error {
  limit: number;
  windowHours: number;
  resetAt: string; // ISO timestamp of oldest_in_window + 24h

  constructor(body: { limit: number; window_hours: number; reset_at: string }) {
    super('rate_limit_exceeded');
    this.limit = body.limit;
    this.windowHours = body.window_hours;
    this.resetAt = body.reset_at;
  }
}

export interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  created_at: string;
  channel_id?: string;
  channel_title?: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  preview?: string | null;
}

export interface ConversationAcquisition {
  conversation: Conversation;
  reused: boolean;
}

export interface Citation {
  chunk_id: string;
  video_id: string;
  video_title: string;
  video_url: string;
  start_seconds: number;
  end_seconds: number;
  snippet: string;
  /**
   * True when the LLM emitted a `[c:<chunk_id>]` marker referencing this
   * chunk in its final answer. Drives the two-tier "Sources cited" /
   * "All sources consulted" render. Optional for backward compatibility
   * with messages persisted before the two-tier system shipped.
   */
  is_cited?: boolean;
  /**
   * Discriminator for the citation rendering split. 'youtube' (default)
   * gets the embedded player + ?t= deep link. 'dynamous' (paid course /
   * workshop content) gets a static link to `lesson_url` because Circle
   * doesn't support timestamp deep links. Optional for backward
   * compatibility with messages persisted before issue #147.
   */
  source_type?: 'youtube' | 'dynamous' | string;
  /**
   * Circle lesson/workshop URL — populated for `source_type === 'dynamous'`,
   * empty for YouTube citations.
   */
  lesson_url?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  /** RAG citations — only populated for freshly-streamed assistant messages */
  sources?: Citation[];
  termination_reason?:
    | 'completed'
    | 'user_cancelled'
    | 'client_disconnected'
    | 'provider_timeout'
    | 'length'
    | 'failed'
    | null;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  rut_masked: string;
  last_evolution_at: string | null;
  birth_date?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PatientDetail extends Patient {
  phone: string | null;
  email: string | null;
}

export interface CreatePatientBody {
  first_name: string;
  last_name: string;
  rut: string;
  birth_date?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface UpdatePatientBody {
  first_name: string;
  last_name: string;
  rut?: string | null;
  birth_date?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ReviewFlag {
  source_text: string;
  reason: string;
}

export interface ClinicalDraft {
  context: string;
  findings: string;
  assessment: string;
  treatment: string;
  follow_up: string;
  review_flags: ReviewFlag[];
}

export interface ClinicalMessage {
  id: string;
  thread_id: string;
  turn_id: string;
  role: 'user' | 'assistant';
  content: string;
  clinical_result?: ClinicalReadResult | null;
  turn_status?: 'running' | 'completed' | 'failed' | null;
  turn_error_code?: string | null;
  context_items?: ClinicalContextItem[] | null;
  patient_switch?: {
    item_id: string;
    current_patient: ClinicalPatient;
    detected_patient: ClinicalPatient;
    resolution: 'pending' | 'kept_current' | 'changed_patient';
  } | null;
  created_at: string;
}

export interface ClinicalReadResult {
  result_kind: string;
  payload: Record<string, unknown>;
}

export interface ComposerContextItem {
  id: string;
  kind: 'drive_selection';
  sourceId: string;
  sourceName: string;
  content: string;
}

export interface ClinicalContextItem {
  id: string;
  kind: 'drive_selection';
  source_id: string;
  source_name: string;
  content: string;
}

export interface ClinicalPatient {
  id: string;
  first_name: string;
  last_name: string;
  rut_masked: string;
  birth_date?: string | null;
}

export interface ClinicalPendingAction {
  id: string;
  thread_id: string;
  turn_id: string;
  artifact_id?: string | null;
  patient_id: string;
  action_type: string;
  proposal_payload: {
    evolution_id: string;
    patient_id: string;
    evolution_at: string;
    raw_note: string;
    generated_text: string;
    final_text: string;
  } | null;
  proposal_hash: string;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'failed';
  expires_at: string;
  created_at: string;
  resolved_at?: string | null;
  result_resource_id?: string | null;
  patient?: ClinicalPatient | null;
  drive_export?: DriveExportState | null;
}

export interface ClinicalTurnArtifact {
  id: string;
  owner_user_id: string;
  thread_id: string;
  turn_id: string;
  patient_id: string;
  artifact_type: 'clinical_draft';
  status: 'draft' | 'stale' | 'pending' | 'approved' | 'declined' | 'failed';
  source_note: string;
  generated_draft: ClinicalDraft;
  draft: ClinicalDraft;
  evolution_at: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  patient?: ClinicalPatient | null;
}

export interface ClinicalThread {
  id: string;
  owner_user_id: string;
  title: string;
  active_patient: ClinicalPatient | null;
  pending_action_patient: ClinicalPatient | null;
  active_turn_id: string | null;
  created_at: string;
  updated_at: string;
  messages: ClinicalMessage[];
  artifacts: ClinicalTurnArtifact[];
  pending_action: ClinicalPendingAction | null;
  actions?: ClinicalPendingAction[];
}

export interface ClinicalThreadSummary {
  id: string;
  title: string;
  active_patient_id: string | null;
  active_turn_id: string | null;
  updated_at: string;
  preview: string | null;
  approval_pending: boolean;
}

export interface SaveEvolutionBody {
  id: string;
  evolution_at: string;
  raw_note: string;
  generated_text: string;
  final_text: string;
}

export interface EvolutionSummary {
  id: string;
  patient_id: string;
  evolution_at: string;
  preview: string;
  created_at: string;
}

export interface EvolutionDetail {
  id: string;
  patient_id: string;
  evolution_at: string;
  final_text: string;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

async function parseApiError(res: Response): Promise<never> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep non-JSON errors as text.
  }
  throw new ApiError(res.status, body);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    // Session missing/expired — bounce to login, preserving return path.
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const returnTo = window.location.pathname + window.location.search;
      window.location.assign(`/login?from=${encodeURIComponent(returnTo)}`);
    }
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Keep non-JSON errors as text.
    }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

// Conversations
export const getConversations = () => request<Conversation[]>('/conversations');
export const searchConversations = (q: string) =>
  request<Conversation[]>(`/conversations/search?q=${encodeURIComponent(q)}`);
export const createConversation = () =>
  request<Conversation>('/conversations', { method: 'POST', body: '{}' });
export const acquireConversation = () =>
  request<ConversationAcquisition>('/conversations/acquire', { method: 'POST', body: '{}' });
export const getConversation = (id: string) =>
  request<ConversationWithMessages>(`/conversations/${id}`);
export const deleteConversation = (id: string) =>
  fetch(`${BASE}/conversations/${id}`, { method: 'DELETE', credentials: 'include' });
export const renameConversation = (id: string, title: string) =>
  request<Conversation>(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

// Videos
export const getVideos = () => request<Video[]>('/videos');

// Patients
export const getPatients = () => request<Patient[]>('/patients');
export const searchPatients = (query: string) =>
  request<Patient[]>('/patients/search', { method: 'POST', body: JSON.stringify({ query }) });
export const createPatient = (body: CreatePatientBody) =>
  request<Patient>('/patients', { method: 'POST', body: JSON.stringify(body) });
export const getPatient = (id: string) => request<PatientDetail>(`/patients/${id}`);
export const updatePatient = (id: string, body: UpdatePatientBody) =>
  request<Patient>(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const generateEvolution = (patientId: string, rawNote: string) =>
  request<ClinicalDraft>('/evolutions/generate', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId, raw_note: rawNote }),
  });
export const saveEvolution = (patientId: string, body: SaveEvolutionBody) =>
  request<EvolutionDetail>(`/patients/${patientId}/evolutions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const getPatientEvolutions = (patientId: string) =>
  request<EvolutionSummary[]>(`/patients/${patientId}/evolutions`);
export const getEvolution = (evolutionId: string) =>
  request<EvolutionDetail>(`/evolutions/${evolutionId}`);

// Clinical Assistant — intentionally separate from RAG conversations.
export interface PendingWorkPatient {
  id: string;
  display_name: string;
  rut_masked: string;
}

export interface ClinicalContextConflict {
  code: 'CLINICAL_CONTEXT_CONFLICT';
  reason: 'different_patient' | 'pending_approval' | 'active_draft' | 'thread_has_history';
  current: { thread_id: string; patient: PendingWorkPatient | null };
  requested: { patient: PendingWorkPatient };
  allowed_actions: ('continue_current' | 'open_new_thread')[];
}

export const openClinicalContext = (body: {
  patient_id: string;
  thread_id?: string | null;
  evolution_id?: string | null;
  mode?: 'reuse_compatible' | 'create_new';
}) =>
  request<{ resolution: 'created' | 'reused'; thread: ClinicalThread }>(
    '/clinical-threads/open-context',
    { method: 'POST', body: JSON.stringify(body) },
  );

export type PendingWorkAction =
  | { kind: 'review_approval'; action_id: string; thread_id: string }
  | { kind: 'continue_draft'; artifact_id: string; thread_id: string }
  | { kind: 'retry_drive_export'; evolution_id: string; thread_id: string | null };

export interface PendingWorkItem {
  id: string;
  kind: 'approval_required' | 'recoverable_draft' | 'drive_export_failed';
  patient: PendingWorkPatient;
  updated_at: string;
  action: PendingWorkAction;
}

export interface PendingWorkPage {
  items: PendingWorkItem[];
  next_cursor: string | null;
  total: number;
}

export interface PatientActor {
  user_id: string;
  display_name: string | null;
}
export interface PatientNote {
  id: string;
  patient_id: string;
  body: string;
  revision: number;
  created_by: PatientActor;
  updated_by: PatientActor;
  created_at: string;
  updated_at: string;
}
export interface PatientNoteRevision {
  id: string;
  note_id: string;
  revision: number;
  action: 'created' | 'edited';
  previous_body: string | null;
  new_body: string;
  actor: PatientActor;
  changed_at: string;
}
export interface PatientNotePage {
  items: PatientNote[];
  next_cursor: string | null;
  total: number;
}
export interface PatientNoteRevisionPage {
  items: PatientNoteRevision[];
  next_cursor: string | null;
  total: number;
}
export function getPatientNotes(
  patientId: string,
  cursor?: string,
  limit = 20,
): Promise<PatientNotePage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return request(`/patients/${patientId}/notes?${query}`);
}
export function getPatientNote(patientId: string, noteId: string): Promise<PatientNote> {
  return request(`/patients/${patientId}/notes/${noteId}`);
}
export function createPatientNote(
  patientId: string,
  body: { id: string; body: string },
): Promise<PatientNote> {
  return request(`/patients/${patientId}/notes`, { method: 'POST', body: JSON.stringify(body) });
}
export function updatePatientNote(
  patientId: string,
  noteId: string,
  body: { expected_revision: number; body: string },
): Promise<PatientNote> {
  return request(`/patients/${patientId}/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function getPatientNoteRevisions(
  patientId: string,
  noteId: string,
  cursor?: string,
  limit = 20,
): Promise<PatientNoteRevisionPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return request(`/patients/${patientId}/notes/${noteId}/revisions?${query}`);
}

export function getClinicalPendingWork(
  patientId?: string,
  cursor?: string,
  options?: { kind?: PendingWorkItem['kind']; limit?: number },
): Promise<PendingWorkPage> {
  const query = new URLSearchParams();
  if (patientId) query.set('patient_id', patientId);
  if (cursor) query.set('cursor', cursor);
  if (options?.kind) query.set('kind', options.kind);
  if (options?.limit !== undefined) query.set('limit', String(options.limit));
  return request<PendingWorkPage>(`/clinical-pending-work?${query}`);
}

export const createClinicalThread = (title = 'Asistente clínico') =>
  request<ClinicalThread>('/clinical-threads', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
export const acquireClinicalThread = () =>
  request<{ thread: ClinicalThread; reused: boolean }>('/clinical-threads/acquire', {
    method: 'POST',
    body: '{}',
  });
export const getClinicalThreads = () => request<ClinicalThreadSummary[]>('/clinical-threads');
export const getClinicalThread = (id: string) => request<ClinicalThread>(`/clinical-threads/${id}`);
export const renameClinicalThread = (id: string, title: string) =>
  request<ClinicalThread>(`/clinical-threads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
export const deleteClinicalThread = async (id: string): Promise<void> => {
  const response = await fetch(`${BASE}/clinical-threads/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) return parseApiError(response);
};
export const setClinicalActivePatient = (threadId: string, patientId: string | null) =>
  request<ClinicalThread>(`/clinical-threads/${threadId}/active-patient`, {
    method: 'PATCH',
    body: JSON.stringify({ patient_id: patientId }),
  });
export const resolveClinicalPatientSwitch = (
  threadId: string,
  turnId: string,
  decision: 'keep_current' | 'change_patient',
) =>
  request<ClinicalThread>(`/clinical-threads/${threadId}/turns/${turnId}/patient-switch`, {
    method: 'PATCH',
    body: JSON.stringify({ decision }),
  });
export const streamClinicalTurn = async (
  threadId: string,
  body: { turn_id: string; content: string; context_items?: ClinicalContextItem[] },
  signal?: AbortSignal,
): Promise<Response> => {
  const res = await fetch(`${BASE}/clinical-threads/${threadId}/turns`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign(`/login?from=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new Error('Not authenticated');
  }
  if (!res.ok) return parseApiError(res);
  return res;
};
export const cancelClinicalTurn = (threadId: string, turnId: string) =>
  request<{ status: string }>(`/clinical-threads/${threadId}/turns/${turnId}/cancel`, {
    method: 'POST',
  });
export const prepareClinicalSave = (
  threadId: string,
  body: {
    turn_id: string;
    artifact_id: string;
  },
) =>
  request<ClinicalPendingAction & { patient: ClinicalPatient }>(
    `/clinical-threads/${threadId}/prepare-save`,
    { method: 'POST', body: JSON.stringify(body) },
  );
export const regenerateClinicalDraft = (threadId: string, artifactId: string) =>
  request<ClinicalDraft>(`/clinical-threads/${threadId}/drafts`, {
    method: 'POST',
    body: JSON.stringify({ artifact_id: artifactId }),
  });
export const updateClinicalArtifact = (
  threadId: string,
  artifactId: string,
  body: { source_note: string; draft: ClinicalDraft; evolution_at: string },
) =>
  request<ClinicalTurnArtifact>(`/clinical-threads/${threadId}/artifacts/${artifactId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const resolveClinicalAction = (
  actionId: string,
  decision: 'approve' | 'decline',
  proposalHash: string,
) =>
  request<ClinicalPendingAction & { result?: EvolutionDetail }>(
    `/clinical-actions/${actionId}/resolve`,
    { method: 'POST', body: JSON.stringify({ decision, proposal_hash: proposalHash }) },
  );
export const returnClinicalActionToEditing = (actionId: string) =>
  request<{ id: string; thread_id: string; artifact_id: string | null }>(
    `/clinical-actions/${actionId}/return-to-editing`,
    { method: 'POST', body: '{}' },
  );

export type DriveExportStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'unknown';

export interface DriveExportState {
  status: DriveExportStatus;
  error_code?: string;
  journal?: {
    period_type: 'weekly' | 'daily';
    period_key: string;
    journal_part?: number;
    display_name?: string;
  };
  synced_at?: string;
}

export interface DriveJournalPreferences {
  frequency: 'weekly' | 'daily';
}

export const getDriveJournalPreferences = () =>
  request<DriveJournalPreferences>('/google-drive/evolution-journals/preferences');

export const updateDriveJournalPreferences = (frequency: DriveJournalPreferences['frequency']) =>
  request<DriveJournalPreferences>('/google-drive/evolution-journals/preferences', {
    method: 'PUT',
    body: JSON.stringify({ frequency }),
  });

export const retryClinicalDriveExport = (evolutionId: string) =>
  request<{ drive_export: DriveExportState }>(
    `/clinical/evolutions/${encodeURIComponent(evolutionId)}/drive-export/retry`,
    { method: 'POST' },
  );

export const transcribeAudio = async (
  audio: Blob,
  signal?: AbortSignal,
): Promise<{ text: string }> => {
  const res = await fetch(`${BASE}/transcriptions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
    signal,
  });
  if (!res.ok) return parseApiError(res);
  return res.json() as Promise<{ text: string }>;
};

export interface IngestVideoBody {
  title: string;
  description: string;
  url: string;
  transcript: string;
}

export interface IngestVideoResponse {
  video_id: string;
  chunks_created: number;
  status: string;
}

export const ingestVideo = (body: IngestVideoBody) =>
  request<IngestVideoResponse>('/ingest', {
    method: 'POST',
    body: JSON.stringify(body),
  });

// Health
export const getHealth = () =>
  request<{ status: string; video_count: number; chunk_count: number; db_path: string }>('/health');

// ─── Admin ────────────────────────────────────────────────────────────────
// All /api/admin/* endpoints require the configured ADMIN_USER_EMAIL; the
// backend returns 403 for any other authenticated user. Callers should gate
// UI with `useAuth().user?.is_admin` first, but never rely on it for security.

export interface AdminVideo extends Video {
  chunk_count: number;
}

export interface AdminVideosResponse {
  videos: AdminVideo[];
}

export interface AddVideoResponse {
  video_id: string;
  chunks_created: number;
  status: string;
}

export interface SyncChannelResponse {
  sync_run_id: string;
  status: string;
  videos_total: number;
  videos_new: number;
  videos_error: number;
}

export const listAdminVideos = () => request<AdminVideosResponse>('/admin/videos');

export const searchAdminVideos = (q: string) =>
  request<AdminVideosResponse>(`/admin/videos/search?q=${encodeURIComponent(q)}`);

export const addVideoByUrl = (url: string) =>
  request<AddVideoResponse>('/admin/videos', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

export const deleteVideo = async (id: string): Promise<void> => {
  const res = await fetch(`${BASE}/admin/videos/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
};

export const resyncVideo = (id: string) =>
  request<AddVideoResponse>(`/admin/videos/${id}/re-sync`, { method: 'POST' });

export const syncChannel = () =>
  request<SyncChannelResponse>('/admin/videos/sync-channel', { method: 'POST' });

// ─── Google Drive bootstrap ────────────────────────────────────────────────
// Phase 3 seam: status check after session hydration and the sole OAuth-start
// handoff. The start endpoint is POST-only and returns the backend-built
// provider URL; the frontend follows it with `window.location.assign` exactly
// once — never GET, a form, a browser-built URL, or a chained popup.

export interface DriveStatus {
  configured: boolean;
  status:
    | 'unconfigured'
    | 'disconnected'
    | 'connected'
    | 'workspace_missing'
    | 'workspace_recovery_pending'
    | 'unavailable'
    | 'revoked';
  retryable?: boolean;
  workspace?: { folder_name: string };
}

export const getDriveStatus = () => request<DriveStatus>('/google-drive/status');

export const startDriveOAuth = () =>
  request<{ authorization_url: string }>('/google-drive/oauth/start', { method: 'POST' });

// ─── Google Drive managed workspace ────────────────────────────────────────
// Phase 4/5 seam: patient-scoped list/search/read/create/update, no-store
// Picker token, import-copy, workspace recreation, and explicit disconnect.
// Search is body-based; document names and query terms never enter URLs.

export type DriveSourceKind = 'text' | 'markdown' | 'docx' | 'google-doc' | 'pdf' | 'unsupported';

export interface DriveSourceFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  version?: string;
  kind: DriveSourceKind;
  editable: boolean;
  webViewLink?: string;
}

export interface DriveSourcePage {
  files: DriveSourceFile[];
  next_page_token: string | null;
}

export interface DriveSourceTextContent extends DriveSourceFile {
  content: string;
}

export async function listDriveSources(pageToken?: string): Promise<DriveSourcePage> {
  const query = pageToken ? `?page_token=${encodeURIComponent(pageToken)}` : '';
  return request<DriveSourcePage>(`/google-drive/sources${query}`);
}

export async function getDriveSource(fileId: string): Promise<DriveSourceFile> {
  return request<DriveSourceFile>(`/google-drive/sources/${encodeURIComponent(fileId)}`);
}

export async function getDriveSourceText(fileId: string): Promise<DriveSourceTextContent> {
  return request<DriveSourceTextContent>(
    `/google-drive/sources/${encodeURIComponent(fileId)}/content`,
  );
}

export async function updateDriveSourceText(
  fileId: string,
  content: string,
): Promise<DriveSourceTextContent> {
  return request<DriveSourceTextContent>(
    `/google-drive/sources/${encodeURIComponent(fileId)}/content`,
    {
      method: 'PUT',
      body: JSON.stringify({ content }),
    },
  );
}

export interface DriveFile {
  id: string;
  name: string;
  version: string;
  mimeType: string;
  modifiedTime: string;
}

export interface DriveFilePage {
  files: DriveFile[];
  next_page_token: string | null;
}

export interface DriveFileContent extends DriveFile {
  content: string;
}

export interface DriveJournalSummary {
  period_type: 'weekly' | 'daily';
  period_key: string;
  journal_part: number;
  display_name: string;
  updated_at: string;
}

export interface DriveJournalPage {
  journals: DriveJournalSummary[];
}

export interface DriveJournalEntry {
  evolution_id: string;
  occurred_at: string;
  patient_display_name: string;
  patient_rut_masked: string;
  content: string;
}

export interface DriveJournalDetail extends DriveJournalSummary {
  entries: DriveJournalEntry[];
}

export interface DriveJournalDetailResponse {
  journal: DriveJournalDetail;
}

export interface DriveJournalTarget {
  evolutionId: string;
  journal: {
    period_type: 'weekly' | 'daily';
    period_key: string;
    journal_part: number;
    display_name?: string;
  };
}

export const listDriveJournals = () =>
  request<DriveJournalPage>('/google-drive/evolution-journals');

function validateJournalPath(
  periodType: DriveJournalSummary['period_type'],
  periodKey: string,
  journalPart: number,
): void {
  if (periodType !== 'weekly' && periodType !== 'daily')
    throw new TypeError('Invalid journal period type');
  const dailyMatch = periodKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dailyDate = dailyMatch
    ? new Date(Date.UTC(Number(dailyMatch[1]), Number(dailyMatch[2]) - 1, Number(dailyMatch[3])))
    : null;
  const validDailyDate = Boolean(
    dailyMatch &&
      dailyDate &&
      dailyDate.getUTCFullYear() === Number(dailyMatch[1]) &&
      dailyDate.getUTCMonth() === Number(dailyMatch[2]) - 1 &&
      dailyDate.getUTCDate() === Number(dailyMatch[3]),
  );
  const validPeriodKey =
    periodType === 'weekly' ? /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(periodKey) : validDailyDate;
  if (!validPeriodKey) throw new TypeError('Invalid journal period key');
  if (!Number.isInteger(journalPart) || journalPart < 1)
    throw new TypeError('Journal part must be positive');
}

export const getDriveJournalDetail = (
  periodType: DriveJournalSummary['period_type'],
  periodKey: string,
  journalPart: number,
) => {
  validateJournalPath(periodType, periodKey, journalPart);
  return request<DriveJournalDetailResponse>(
    `/google-drive/evolution-journals/${encodeURIComponent(periodType)}/${encodeURIComponent(periodKey)}/parts/${journalPart}`,
  );
};

export const listDriveFiles = (patientId: string, pageToken?: string) => {
  const query = pageToken
    ? `?patient_id=${encodeURIComponent(patientId)}&page_token=${encodeURIComponent(pageToken)}`
    : `?patient_id=${encodeURIComponent(patientId)}`;
  return request<DriveFilePage>(`/google-drive/files${query}`);
};

export const searchDriveFiles = (body: {
  patient_id: string;
  query: string;
  page_token?: string;
}) =>
  request<DriveFilePage>('/google-drive/files/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getDriveFile = (fileId: string, patientId: string) =>
  request<DriveFileContent>(
    `/google-drive/files/${encodeURIComponent(fileId)}?patient_id=${encodeURIComponent(patientId)}`,
  );

export const createDriveFile = (body: {
  patient_id: string;
  operation_id: string;
  name: string;
  content: string;
}) => request<DriveFile>('/google-drive/files', { method: 'POST', body: JSON.stringify(body) });

export const updateDriveFile = (
  fileId: string,
  body: {
    patient_id: string;
    operation_id: string;
    content: string;
    expected_version: string;
  },
) =>
  request<DriveFile>(`/google-drive/files/${encodeURIComponent(fileId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const getDrivePickerToken = (patientId?: string | null) =>
  request<{ access_token: string; expires_in: number }>('/google-drive/picker-token', {
    method: 'POST',
    body: JSON.stringify(patientId ? { patient_id: patientId } : {}),
  });

export const importDriveCopy = (body: {
  patient_id: string;
  operation_id: string;
  source_file_id: string;
  name?: string;
}) =>
  request<DriveFile>('/google-drive/import-copy', { method: 'POST', body: JSON.stringify(body) });

export const recreateDriveWorkspace = (operationId: string, acknowledgePossibleOrphan: boolean) =>
  request<DriveStatus>('/google-drive/workspace/recreate', {
    method: 'POST',
    body: JSON.stringify({
      operation_id: operationId,
      acknowledge_possible_orphan: acknowledgePossibleOrphan,
    }),
  });

export const disconnectDrive = () =>
  request<DriveStatus>('/google-drive/disconnect', { method: 'POST' });

export type Dentition = 'permanent' | 'primary';
export type ToothSurface = 'M' | 'D' | 'O' | 'V' | 'L';
export interface ConditionCatalogEntry {
  code: string;
  label_es: string;
  surface_codes: ToothSurface[];
}
export interface ConditionCatalog {
  version: 1;
  conditions: ConditionCatalogEntry[];
}
export interface ConditionSnapshot {
  dentition: Dentition;
  tooth_fdi: number;
  condition_code: string;
  surfaces: ToothSurface[];
  note: string | null;
  status: 'active' | 'resolved';
}
export interface PatientCondition extends ConditionSnapshot {
  id: string;
  patient_id: string;
  revision: number;
  created_by: PatientActor;
  updated_by: PatientActor;
  created_at: string;
  updated_at: string;
}
export interface PatientConditionRevision {
  id: string;
  condition_id: string;
  revision: number;
  action: 'created' | 'edited' | 'resolved';
  before: ConditionSnapshot | null;
  after: ConditionSnapshot;
  actor: PatientActor;
  changed_at: string;
}
export interface PatientConditionPage {
  items: PatientCondition[];
  total: number;
  next_cursor: string | null;
}
export interface PatientConditionRevisionPage {
  items: PatientConditionRevision[];
  total: number;
  next_cursor: string | null;
}
export interface CreatePatientCondition {
  id: string;
  dentition: Dentition;
  tooth_fdi: number;
  condition_code: string;
  surfaces: ToothSurface[];
  note: string | null;
}
export interface UpdatePatientCondition {
  expected_revision: number;
  surfaces?: ToothSurface[];
  note?: string | null;
  status?: 'resolved';
}
export function getConditionCatalog(): Promise<ConditionCatalog> {
  return request('/patients/condition-catalog');
}
export function getPatientConditions(
  patientId: string,
  options: {
    dentition?: Dentition;
    status?: 'all' | 'active' | 'resolved';
    cursor?: string;
    limit?: number;
  } = {},
): Promise<PatientConditionPage> {
  const query = new URLSearchParams({
    limit: String(options.limit ?? 20),
    status: options.status ?? 'all',
  });
  if (options.dentition) query.set('dentition', options.dentition);
  if (options.cursor) query.set('cursor', options.cursor);
  return request(`/patients/${patientId}/conditions?${query}`);
}
export function getPatientCondition(
  patientId: string,
  conditionId: string,
): Promise<PatientCondition> {
  return request(`/patients/${patientId}/conditions/${conditionId}`);
}
export function createPatientCondition(
  patientId: string,
  body: CreatePatientCondition,
): Promise<PatientCondition> {
  return request(`/patients/${patientId}/conditions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function updatePatientCondition(
  patientId: string,
  conditionId: string,
  body: UpdatePatientCondition,
): Promise<PatientCondition> {
  return request(`/patients/${patientId}/conditions/${conditionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function getPatientConditionRevisions(
  patientId: string,
  conditionId: string,
  cursor?: string,
  limit = 20,
): Promise<PatientConditionRevisionPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return request(`/patients/${patientId}/conditions/${conditionId}/revisions?${query}`);
}
