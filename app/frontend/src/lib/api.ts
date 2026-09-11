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
}

export interface CreatePatientBody {
  first_name: string;
  last_name: string;
  rut: string;
  birth_date?: string | null;
}

export interface UpdatePatientBody {
  first_name: string;
  last_name: string;
  rut?: string | null;
  birth_date?: string | null;
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
  created_at: string;
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
export const getPatient = (id: string) => request<Patient>(`/patients/${id}`);
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
export const streamClinicalTurn = async (
  threadId: string,
  body: { turn_id: string; content: string },
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
    | 'revoked';
  workspace?: { folder_name: string };
}

export const getDriveStatus = () => request<DriveStatus>('/google-drive/status');

export const startDriveOAuth = () =>
  request<{ authorization_url: string }>('/google-drive/oauth/start', { method: 'POST' });

// ─── Google Drive managed workspace ────────────────────────────────────────
// Phase 4/5 seam: patient-scoped list/search/read/create/update, no-store
// Picker token, import-copy, workspace recreation, and explicit disconnect.
// Search is body-based; document names and query terms never enter URLs.

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

export const getDrivePickerToken = (patientId: string) =>
  request<{ access_token: string; expires_in: number }>('/google-drive/picker-token', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId }),
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
