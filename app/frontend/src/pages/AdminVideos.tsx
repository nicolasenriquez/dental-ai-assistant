/**
 * Admin video library management.
 *
 * Re-reads the list after every mutation rather than surgically patching local
 * state — chunk_count changes after re-sync, and sync-channel can add many
 * rows at once. Authoritative list is cheaper than local bookkeeping.
 */

import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AddVideoModal } from '../components/AddVideoModal';
import { useAdminVideos } from '../hooks/useAdminVideos';
import { isAuthenticatedStatus, isUnauthenticatedStatus, useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { type AdminVideo, addVideoByUrl, deleteVideo, resyncVideo, syncChannel } from '../lib/api';

export function AdminVideos() {
  const { status, user } = useAuth();
  const { addToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const authed = isAuthenticatedStatus(status);
  const { videos, loading, refetch } = useAdminVideos(
    debouncedQuery,
    authed && Boolean(user?.is_admin),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Debounce search query — 250ms per issue #92 pattern
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Guard rendering
  if (!authed) {
    if (isUnauthenticatedStatus(status) || status === 'error') {
      return <Navigate to="/login" replace state={{ from: '/admin' }} />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text-secondary)]">
        Cargando…
      </div>
    );
  }
  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  async function handleAdd(url: string) {
    const res = await addVideoByUrl(url);
    addToast(`Video agregado (${res.chunks_created} fragmentos)`, 'success');
    await refetch();
  }

  async function handleDelete(video: AdminVideo) {
    if (
      !confirm(
        `¿Eliminar "${video.title}" y sus ${video.chunk_count} fragmentos? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setPendingId(video.id);
    try {
      await deleteVideo(video.id);
      addToast('Video eliminado', 'success');
      await refetch();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo eliminar', 'error');
    } finally {
      setPendingId(null);
    }
  }

  async function handleResync(video: AdminVideo) {
    setPendingId(video.id);
    try {
      const res = await resyncVideo(video.id);
      addToast(`Video sincronizado (${res.chunks_created} fragmentos)`, 'success');
      await refetch();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo sincronizar', 'error');
    } finally {
      setPendingId(null);
    }
  }

  async function handleSyncChannel() {
    setSyncing(true);
    try {
      const res = await syncChannel();
      addToast(
        `Sincronización del canal ${res.status}: ${res.videos_new} nuevos, ${res.videos_error} errores`,
        res.status === 'completed' ? 'success' : 'error',
      );
      await refetch();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'No se pudo sincronizar el canal', 'error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Administración de biblioteca</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Agrega, resincroniza o elimina videos del corpus RAG.
            </p>
          </div>
          <Link to="/chat" className="text-sm text-[var(--accent)] hover:underline">
            ← Volver al chat
          </Link>
        </header>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            disabled={syncing}
            className="px-3 py-2 rounded bg-[var(--accent)] text-white font-medium disabled:opacity-50"
          >
            + Agregar video por URL
          </button>
          <button
            type="button"
            onClick={handleSyncChannel}
            disabled={syncing}
            className="px-3 py-2 rounded border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {syncing ? 'Sincronizando canal…' : 'Sincronizar canal'}
          </button>
          <button
            type="button"
            onClick={refetch}
            disabled={loading || syncing}
            className="px-3 py-2 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>

        <label htmlFor="admin-video-search" className="sr-only">
          Buscar videos
        </label>
        <input
          id="admin-video-search"
          type="text"
          placeholder="Buscar videos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 mb-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-primary)] text-[13px] outline-none transition-colors focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />

        <p className="admin-video-table-hint">Desliza horizontalmente para ver las acciones.</p>

        <div className="admin-video-table-surface bg-[var(--surface-1)] border border-[var(--border)] rounded-lg">
          {loading ? (
            <div className="p-6 text-center text-[var(--text-secondary)]">Cargando…</div>
          ) : videos.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-secondary)]">
              {debouncedQuery.trim()
                ? `No hay coincidencias para "${debouncedQuery}"`
                : 'Aún no hay videos. Agrega uno por URL o sincroniza un canal.'}
            </div>
          ) : (
            <table className="admin-video-table w-full text-sm">
              <caption className="sr-only">Videos disponibles en la biblioteca</caption>
              <thead className="bg-[var(--surface-2)] text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Fragmentos</th>
                  <th className="px-4 py-2 font-medium">Agregado</th>
                  <th className="px-4 py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => {
                  const isPending = pendingId === v.id;
                  return (
                    <tr key={v.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2">
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {v.title || '(sin título)'}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{v.chunk_count}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        {v.created_at.slice(0, 10)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3 whitespace-nowrap justify-end">
                          <button
                            type="button"
                            onClick={() => handleResync(v)}
                            disabled={isPending || syncing}
                            className="min-h-11 px-3 py-1.5 text-xs rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                          >
                            {isPending ? '…' : 'Sincronizar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(v)}
                            disabled={isPending || syncing}
                            className="min-h-11 px-3 py-1.5 text-xs rounded border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--surface-2)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AddVideoModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAdd}
      />
    </div>
  );
}
