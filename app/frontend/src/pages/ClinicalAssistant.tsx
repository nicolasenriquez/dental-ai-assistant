import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ClinicalAssistantArea } from '../components/clinical-assistant/ClinicalAssistantArea';
import { ClinicalThreadList } from '../components/clinical-assistant/ClinicalThreadList';
import { acquireClinicalThread } from '../lib/api';

export function ClinicalAssistant() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const [threadListVersion, setThreadListVersion] = useState(0);
  const [creationFailed, setCreationFailed] = useState(false);
  const [createAttempt, setCreateAttempt] = useState(0);
  const createStarted = useRef(false);

  useEffect(() => {
    if (threadId || createStarted.current) return;
    createStarted.current = true;
    setCreationFailed(false);
    void acquireClinicalThread()
      .then(({ thread }) => {
        setCreatedThreadId(thread.id);
        navigate(`/a/${thread.id}`, { replace: true });
      })
      .catch(() => {
        createStarted.current = false;
        setCreationFailed(true);
      });
  }, [createAttempt, navigate, threadId]);

  const activeId = threadId ?? createdThreadId;
  return (
    <AppShell
      showConversations={false}
      workspaceMode
      secondarySidebarContent={(isCollapsed, onRequestExpand) => (
        <ClinicalThreadList
          activeThreadId={activeId ?? undefined}
          isCollapsed={isCollapsed}
          refreshKey={threadListVersion}
          onRequestExpand={onRequestExpand}
        />
      )}
    >
      {activeId ? (
        <ClinicalAssistantArea
          threadId={activeId}
          onThreadStateChanged={() => setThreadListVersion((version) => version + 1)}
        />
      ) : (
        <main className="clinical-assistant-area">
          {creationFailed && (
            <section className="clinical-empty-state" role="alert">
              <h2>No pudimos abrir un hilo clínico</h2>
              <button
                type="button"
                className="clinical-primary-button"
                onClick={() => setCreateAttempt((attempt) => attempt + 1)}
              >
                Reintentar
              </button>
            </section>
          )}
        </main>
      )}
    </AppShell>
  );
}
