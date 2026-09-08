import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClinicalThread, getClinicalThreads, type ClinicalThreadSummary } from '../../lib/api';
import { formatClinicalDateTime } from '../../lib/clinicalDate';

interface ClinicalThreadListProps {
  activeThreadId?: string;
  refreshKey?: number;
}

export function ClinicalThreadList({ activeThreadId, refreshKey = 0 }: ClinicalThreadListProps) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ClinicalThreadSummary[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = async () => setThreads(await getClinicalThreads());
  useEffect(() => { void refresh().catch(() => undefined); }, [refreshKey]);

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
    <section className="clinical-thread-list" aria-label="Hilos del asistente clínico">
      <div className="clinical-thread-list-heading">
        <span>Asistente</span>
        <button type="button" onClick={() => void create()} disabled={creating} aria-label="Nuevo hilo clínico">＋</button>
      </div>
      {threads.map((thread) => (
        <Link key={thread.id} to={`/a/${thread.id}`} className={thread.id === activeThreadId ? 'clinical-thread is-active' : 'clinical-thread'}>
          <span className="clinical-thread-copy">
            <strong>{thread.title}</strong>
            <small>{formatClinicalDateTime(thread.updated_at)}</small>
          </span>
          {thread.approval_pending && <span className="clinical-thread-status" aria-label="Aprobación pendiente">!</span>}
        </Link>
      ))}
      {threads.length === 0 && <button type="button" className="clinical-thread-empty" onClick={() => void create()} disabled={creating}>Nuevo hilo</button>}
    </section>
  );
}
