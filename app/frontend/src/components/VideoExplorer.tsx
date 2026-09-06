import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { type Video, getVideos, ingestVideo } from '../lib/api';

// ── Highlight matched substring in a video title ─────────────────
function highlightMatch(title: string, query: string): string | React.ReactElement {
  if (!title) return title;
  const q = query.trim();
  if (!q) return title;
  const idx = title.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <mark className="bg-blue-500/35 text-inherit p-0 rounded-sm">
        {title.slice(idx, idx + q.length)}
      </mark>
      {title.slice(idx + q.length)}
    </>
  );
}

// ── Skeleton card ────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-slate-800 border border-white/10 rounded-lg p-3.5">
      <div className="skeleton h-3.5 w-3/5 mb-2.5" />
      <div className="skeleton h-2.5 w-9/10 mb-1.5" />
      <div className="skeleton h-2.5 w-3/4" />
    </div>
  );
}

// ── Video card ───────────────────────────────────────────────────
function VideoCard({ video, query = '' }: { video: Video; query?: string }) {
  return (
    <div
      className="bg-slate-800 border border-white/10 rounded-lg p-3.5 transition-colors duration-150"
      onMouseEnter={(e) => e.currentTarget.classList.add('video-card-hover')}
      onMouseLeave={(e) => e.currentTarget.classList.remove('video-card-hover')}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-slate-100 mb-1.5 leading-tight">
        {highlightMatch(video.title, query)}
      </p>

      {/* Description / channel attribution */}
      {video.channel_title ? (
        <p className="text-xs text-slate-400 mb-2 leading-relaxed">
          Sincronizado desde {video.channel_title}
        </p>
      ) : video.description ? (
        <p className="text-xs text-slate-400 mb-2 leading-relaxed">
          {video.description.length > 120
            ? video.description.slice(0, 117) + '…'
            : video.description}
        </p>
      ) : null}

      {/* URL link */}
      {video.url && (
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ver ${video.title} en YouTube`}
          className="inline-flex items-center gap-1 text-xs text-blue-500 no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5,1 H9.5 V5.5" />
            <line x1="9.5" y1="1" x2="2" y2="8.5" />
            <path d="M2,3 H1 V10 H8 V9" />
          </svg>
          Ver en YouTube
        </a>
      )}
    </div>
  );
}

// ── Main VideoExplorer panel ──────────────────────────────────────
interface VideoExplorerProps {
  isOpen: boolean;
  onClose: () => void;
}

const INGEST_FIELDS = [
  { key: 'title', label: 'Título', placeholder: 'Título del video', type: 'text' },
  {
    key: 'description',
    label: 'Descripción',
    placeholder: 'Descripción breve',
    type: 'text',
  },
  {
    key: 'url',
    label: 'URL de YouTube',
    placeholder: 'https://www.youtube.com/watch?v=...',
    type: 'url',
  },
  {
    key: 'transcript',
    label: 'Transcripción',
    placeholder: 'Texto completo de la transcripción…',
    type: 'textarea',
  },
] as const;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  return container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
}

export function VideoExplorer({ isOpen, onClose }: VideoExplorerProps) {
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestForm, setIngestForm] = useState({
    title: '',
    description: '',
    url: '',
    transcript: '',
  });
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const ingestDialogRef = useRef<HTMLDivElement>(null);
  const ingestCloseRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const restoreIngestFocusRef = useRef<HTMLElement | null>(null);

  const closeDialog = () => {
    setIngestOpen(false);
    setIngestError(null);
  };

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVideos();
      setVideos(data);
    } catch (e) {
      console.error('[VideoExplorer] Failed to load videos:', e);
      setError('No pudimos cargar la biblioteca de videos.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleIngest = async () => {
    if (!ingestForm.title || !ingestForm.description || !ingestForm.url || !ingestForm.transcript) {
      setIngestError('Completa todos los campos.');
      return;
    }
    setIngesting(true);
    setIngestError(null);
    try {
      await ingestVideo(ingestForm);
      const updated = await getVideos();
      setVideos(updated);
      setIngestOpen(false);
      setIngestForm({ title: '', description: '', url: '', transcript: '' });
    } catch (e) {
      console.error('[VideoExplorer] Failed to add video:', e);
      setIngestError('No pudimos agregar el video. Intenta nuevamente.');
    } finally {
      setIngesting(false);
    }
  };

  // Load videos when panel opens
  useEffect(() => {
    if (isOpen && videos.length === 0 && !loading && !error) {
      fetchVideos();
    }
  }, [isOpen, videos.length, loading, error, fetchVideos]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset search state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setDebouncedQuery('');
    }
  }, [isOpen]);

  // Keep keyboard focus inside the panel and restore it to the opener on close.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusCloseButton = () =>
      dialogRef.current?.querySelector<HTMLElement>('[data-close-video-library]')?.focus();
    focusCloseButton();
    const focusFrame = window.requestAnimationFrame?.(focusCloseButton);
    return () => {
      if (focusFrame !== undefined) window.cancelAnimationFrame?.(focusFrame);
      if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!ingestOpen) return;
    restoreIngestFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ingestCloseRef.current?.focus();
    return () => {
      if (restoreIngestFocusRef.current?.isConnected) restoreIngestFocusRef.current.focus();
      restoreIngestFocusRef.current = null;
    };
  }, [ingestOpen]);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleIngestDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(ingestDialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const q = debouncedQuery.trim().toLowerCase();
  const filteredVideos = q
    ? videos.filter((v) =>
        [v.title, v.channel_title, v.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : videos;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-black/50 z-30" />

      {/* Slide-over panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="video-library-title"
        aria-modal="true"
        onKeyDown={handlePanelKeyDown}
        className="video-library-panel fixed top-0 right-0 z-40 flex h-full w-[380px] max-w-[90vw] flex-col border-l border-white/10 bg-gray-900 shadow-[-8px_0_32px_rgba(0,0,0,0.4)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 id="video-library-title" className="m-0 text-base font-semibold text-slate-100">
              Biblioteca de videos
            </h2>
            {!loading && videos.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                {q
                  ? `${filteredVideos.length} de ${videos.length} videos`
                  : `${videos.length} videos en la base de conocimiento`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            data-close-video-library
            aria-label="Cerrar biblioteca de videos"
            className="mr-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-transparent p-2 text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
          {user?.is_admin && (
            <button
              onClick={() => setIngestOpen(true)}
              className="min-h-11 cursor-pointer rounded-md border-none bg-blue-500 px-3 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              title="Agregar video"
            >
              + Agregar video
            </button>
          )}
        </div>

        {/* Search */}
        {!loading && !error && videos.length > 0 && (
          <div className="px-5 py-3 border-b border-white/10 flex-shrink-0">
            <input
              type="search"
              placeholder="Buscar videos…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 bg-slate-900 border border-white/10 rounded-md text-slate-100 text-sm box-border outline-none focus:border-blue-500 transition-colors"
              aria-label="Buscar videos"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5">
          {loading && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="16" cy="16" r="14" />
                <line x1="16" y1="9" x2="16" y2="17" />
                <circle cx="16" cy="22" r="1" fill="#ef4444" stroke="none" />
              </svg>
              <p className="m-0 text-red-500 text-sm">{error}</p>
              <button
                onClick={fetchVideos}
                className="min-h-11 rounded-lg border border-white/10 bg-slate-800 px-5 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && videos.length === 0 && (
            <div className="py-8 text-center text-slate-500 text-sm">
              Aún no hay videos en la base de conocimiento.
            </div>
          )}

          {!loading && !error && videos.length > 0 && filteredVideos.length === 0 && (
            <div className="py-8 text-center text-slate-500 text-sm">
              No hay videos que coincidan con &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {!loading &&
            !error &&
            filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} query={debouncedQuery} />
            ))}
        </div>

        {/* Ingest dialog */}
        {ingestOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div
              ref={ingestDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ingest-video-title"
              onKeyDown={handleIngestDialogKeyDown}
              className="w-[420px] max-w-[calc(100vw-48px)] rounded-xl border border-white/10 bg-slate-800 p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 id="ingest-video-title" className="text-slate-100 text-base font-semibold m-0">
                  Agregar video
                </h3>
                <button
                  type="button"
                  ref={ingestCloseRef}
                  onClick={closeDialog}
                  aria-label="Cerrar formulario de video"
                  className="min-h-11 min-w-11 cursor-pointer border-none bg-none text-lg text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  ×
                </button>
              </div>
              {ingestError && (
                <p role="alert" className="text-red-400 mb-3 text-sm">
                  {ingestError}
                </p>
              )}
              {INGEST_FIELDS.map(({ key, label, placeholder, type }) => (
                <div key={key} className="mb-3">
                  <label htmlFor={key} className="block text-slate-400 text-xs mb-1">
                    {label}
                  </label>
                  {type === 'textarea' ? (
                    <textarea
                      id={key}
                      value={ingestForm[key as keyof typeof ingestForm]}
                      onChange={(e) => setIngestForm({ ...ingestForm, [key]: e.target.value })}
                      placeholder={placeholder}
                      rows={4}
                      className="w-full p-2 bg-slate-900 border border-white/10 rounded-md text-slate-100 text-sm box-border resize-y"
                    />
                  ) : (
                    <input
                      id={key}
                      type={type}
                      value={ingestForm[key as keyof typeof ingestForm]}
                      onChange={(e) => setIngestForm({ ...ingestForm, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full p-2 bg-slate-900 border border-white/10 rounded-md text-slate-100 text-sm box-border"
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={closeDialog}
                  className="min-h-11 cursor-pointer rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleIngest}
                  disabled={ingesting}
                  className="min-h-11 cursor-pointer rounded-md border-none bg-blue-500 px-4 py-2 text-sm text-white disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {ingesting ? 'Agregando…' : 'Agregar video'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
