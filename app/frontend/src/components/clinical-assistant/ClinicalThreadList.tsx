import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  isCollapsed?: boolean;
  refreshKey?: number;
  onRequestExpand?: () => void;
}

export function ClinicalThreadList({
  activeThreadId,
  isCollapsed = false,
  refreshKey = 0,
  onRequestExpand,
}: ClinicalThreadListProps) {
  const navigate = useNavigate();
  const transitionGuard = useOptionalTransitionGuard();
  const [threads, setThreads] = useState<ClinicalThreadSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const guardTransition = (continuation: () => void) => {
    if (transitionGuard) transitionGuard.guardTransition(continuation);
    else continuation();
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setThreads(await getClinicalThreads());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const create = async () => {
    setCreating(true);
    try {
      const { thread } = await acquireClinicalThread();
      setQuery('');
      navigate(`/a/${thread.id}`);
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
      <WorkspaceThreadList
        ariaLabel="Hilos del asistente clínico"
        title="Asistente"
        isCollapsed={isCollapsed}
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
        onSelect={(id) => guardTransition(() => navigate(`/a/${id}`))}
        creating={creating}
        onRetry={() => void refresh()}
        onRequestExpand={onRequestExpand}
        createLabel="Nueva evolución"
        emptyMessage="Aún no hay conversaciones"
        emptyActionLabel="Nueva evolución"
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
            statusLabel={item.statusLabel}
            onSelect={() => guardTransition(() => navigate(`/a/${item.id}`))}
            onDeleteRequest={() => requestRemove(item.id)}
            onRename={(title) => void rename(item.id, title)}
          />
        )}
      />
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
