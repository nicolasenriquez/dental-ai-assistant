import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type ClinicalThreadSummary,
  createClinicalThread,
  getClinicalThreads,
} from '../../lib/api';
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
  const [threads, setThreads] = useState<ClinicalThreadSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

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
      const thread = await createClinicalThread();
      navigate(`/a/${thread.id}`);
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <WorkspaceThreadList
      ariaLabel="Hilos del asistente clínico"
      title="Asistente"
      isCollapsed={isCollapsed}
      items={threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updated_at,
        active: thread.id === activeThreadId,
        statusLabel: thread.approval_pending ? '!' : undefined,
      }))}
      loading={loading}
      error={error}
      query={query}
      onQueryChange={setQuery}
      onCreate={() => void create()}
      onSelect={(id) => navigate(`/a/${id}`)}
      creating={creating}
      onRetry={() => void refresh()}
      onRequestExpand={onRequestExpand}
      createLabel="Nuevo hilo"
    />
  );
}
