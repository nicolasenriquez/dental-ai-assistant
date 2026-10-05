import { SquarePen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOptionalTransitionGuard } from '../../hooks/useTransitionGuard';
import {
  type ClinicalThreadSummary,
  acquireClinicalThread,
  deleteClinicalThread,
  getClinicalThreads,
  renameClinicalThread,
} from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { ConversationRow } from '../sidebar/ConversationList';
import { WorkspaceThreadList } from '../sidebar/WorkspaceThreadList';

interface ClinicalThreadListProps {
  activeThreadId?: string;
  activeTurnRunning?: boolean;
  isCollapsed?: boolean;
  refreshKey?: number;
  onRequestExpand?: () => void;
  onNavigate?: () => void;
}

function formatClinicalUpdatedAt(value: string): string {
  const updated = new Date(value);
  if (!Number.isFinite(updated.getTime())) return '';
  const date = updated.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
  const time = updated.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${date} · ${time}`;
}

export function ClinicalThreadList({
  activeThreadId,
  activeTurnRunning = false,
  isCollapsed = false,
  refreshKey = 0,
  onRequestExpand,
  onNavigate,
}: ClinicalThreadListProps) {
  const navigate = useNavigate();
  const transitionGuard = useOptionalTransitionGuard();
  const [threads, setThreads] = useState<ClinicalThreadSummary[]>([]);
  const location = useLocation();
  const tab =
    new URLSearchParams(location.search).get('view') === 'pending' ? 'pending' : 'threads';
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [startingThreads, setStartingThreads] = useState<Set<string>>(() => new Set());
  const refreshInFlight = useRef(false);
  const previousLocalRun = useRef<{ id?: string; running: boolean }>({ running: false });

  const guardTransition = (continuation: () => void) => {
    if (transitionGuard) transitionGuard.guardTransition(continuation);
    else continuation();
  };

  const refresh = useCallback(async (silent = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError(false);
    }
    try {
      const nextThreads = await getClinicalThreads();
      setThreads(nextThreads);
      setStartingThreads((current) => {
        const next = new Set(current);
        for (const thread of nextThreads) {
          if (thread.active_turn_id) next.delete(thread.id);
        }
        return next.size === current.size ? current : next;
      });
    } catch {
      if (!silent) setError(true);
    } finally {
      refreshInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const previous = previousLocalRun.current;
    if (
      activeThreadId &&
      activeTurnRunning &&
      (!previous.running || previous.id !== activeThreadId)
    ) {
      setStartingThreads((current) => new Set(current).add(activeThreadId));
      void refresh(true);
    } else if (
      activeThreadId &&
      !activeTurnRunning &&
      previous.running &&
      previous.id === activeThreadId
    ) {
      setStartingThreads((current) => {
        if (!current.has(activeThreadId)) return current;
        const next = new Set(current);
        next.delete(activeThreadId);
        return next;
      });
    }
    previousLocalRun.current = { id: activeThreadId, running: activeTurnRunning };
  }, [activeThreadId, activeTurnRunning, refresh]);

  useEffect(() => {
    if (!startingThreads.size) return;
    // ponytail: expire a start that never appears in server summaries (for example, a failed send after navigation).
    const timer = window.setTimeout(() => setStartingThreads(new Set()), 10_000);
    return () => window.clearTimeout(timer);
  }, [startingThreads]);

  const hasRunningThread =
    activeTurnRunning ||
    startingThreads.size > 0 ||
    threads.some((thread) => thread.active_turn_id);
  useEffect(() => {
    if (!hasRunningThread) return;
    const timer = window.setInterval(() => void refresh(true), 2000);
    return () => window.clearInterval(timer);
  }, [hasRunningThread, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const create = async () => {
    setCreating(true);
    try {
      const { thread } = await acquireClinicalThread();
      setQuery('');
      navigate(`/a/${thread.id}`);
      onNavigate?.();
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const rename = async (id: string, title: string) => {
    await renameClinicalThread(id, title);
    setThreads((current) =>
      current.map((thread) => (thread.id === id ? { ...thread, title } : thread)),
    );
  };

  const requestRemove = (id: string) => {
    setConfirmId(id);
    setDeleteError(false);
  };

  const removeThreadNow = async (threadId: string) => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteClinicalThread(threadId);
      const deletedId = threadId;
      setConfirmId(null);
      setThreads((current) => current.filter((thread) => thread.id !== deletedId));
      if (deletedId === activeThreadId) navigate('/assistant');
    } catch (deleteFailure) {
      console.error('[ClinicalThreadList] Delete thread failed:', deleteFailure);
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  const confirmRemove = () => {
    if (!confirmId) return;
    const threadId = confirmId;
    if (threadId === activeThreadId) {
      setConfirmId(null);
      guardTransition(() => void removeThreadNow(threadId));
      return;
    }
    void removeThreadNow(threadId);
  };

  return (
    <>
      {!isCollapsed && (
        <div className="flex gap-2 px-3 py-2" role="group" aria-label="Vista del asistente">
          <button
            type="button"
            className="min-h-11 rounded border border-transparent px-2 py-2 text-sm text-muted aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            aria-pressed={tab === 'threads'}
            onClick={() => guardTransition(() => navigate('/assistant'))}
          >
            Conversaciones
          </button>
          <button
            type="button"
            className="min-h-11 rounded border border-transparent px-2 py-2 text-sm text-muted aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            aria-pressed={tab === 'pending'}
            onClick={() => guardTransition(() => navigate('/assistant?view=pending'))}
          >
            Pendientes
          </button>
        </div>
      )}
      <>
        {!isCollapsed && (
          <button
            type="button"
            className="clinical-sidebar-create"
            onClick={() => guardTransition(() => void create())}
            disabled={creating}
          >
            <SquarePen aria-hidden="true" size={16} strokeWidth={1.7} />
            {creating ? 'Creando…' : 'Nueva conversación'}
          </button>
        )}
        <WorkspaceThreadList
          ariaLabel="Hilos del asistente clínico"
          title="Conversaciones"
          isCollapsed={isCollapsed}
          running={activeTurnRunning || hasRunningThread}
          items={threads.map((thread) => ({
            id: thread.id,
            title: thread.title,
            updatedAt: thread.updated_at,
            active: thread.id === activeThreadId,
            statusLabel: thread.approval_pending ? 'Pendiente de aprobación' : undefined,
          }))}
          loading={loading}
          error={error}
          query={query}
          onQueryChange={setQuery}
          onCreate={() => guardTransition(() => void create())}
          onSelect={(id) =>
            guardTransition(() => {
              navigate(`/a/${id}`);
              onNavigate?.();
            })
          }
          creating={creating}
          onRetry={() => void refresh()}
          onRequestExpand={onRequestExpand}
          createLabel="Nueva conversación"
          showHeaderTitle={false}
          showHeaderCreate={false}
          emptyMessage="Aún no hay conversaciones"
          emptyActionLabel="Nueva conversación"
          renderItem={(item) => (
            <ConversationRow
              conversation={{
                id: item.id,
                title: item.title,
                created_at: item.updatedAt,
                updated_at: item.updatedAt,
              }}
              query={query}
              isActive={Boolean(item.active)}
              isRunning={Boolean(
                threads.find((thread) => thread.id === item.id)?.active_turn_id ||
                  startingThreads.has(item.id) ||
                  (item.id === activeThreadId && activeTurnRunning),
              )}
              statusLabel={item.statusLabel}
              secondaryLabel={formatClinicalUpdatedAt(item.updatedAt)}
              onSelect={() =>
                guardTransition(() => {
                  navigate(`/a/${item.id}`);
                  onNavigate?.();
                })
              }
              onDeleteRequest={() => requestRemove(item.id)}
              onRename={(title) => void rename(item.id, title)}
            />
          )}
        />
      </>
      {confirmId && (
        <ConfirmDialog
          title="¿Eliminar conversación clínica?"
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          tone="danger"
          busy={deleting}
          error={deleteError ? 'No pudimos eliminarla. Intenta nuevamente.' : null}
          onConfirm={() => void confirmRemove()}
          onCancel={() => {
            setConfirmId(null);
            setDeleteError(false);
          }}
        />
      )}
    </>
  );
}
