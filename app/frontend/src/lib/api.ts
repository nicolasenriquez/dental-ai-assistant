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
