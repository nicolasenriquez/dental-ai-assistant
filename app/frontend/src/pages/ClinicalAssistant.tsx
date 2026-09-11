import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ClinicalAssistantArea } from '../components/clinical-assistant/ClinicalAssistantArea';
import { ClinicalThreadList } from '../components/clinical-assistant/ClinicalThreadList';
import { DriveWorkspace, type DriveWorkspaceHandle } from '../components/drive/DriveWorkspace';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { TransitionGuardProvider, useTransitionGuard } from '../hooks/useTransitionGuard';
import { acquireClinicalThread } from '../lib/api';

export function ClinicalAssistant() {
  return (
    <TransitionGuardProvider>
      <ClinicalAssistantContent />
    </TransitionGuardProvider>
  );
}

function ClinicalAssistantContent() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const transitionGuard = useTransitionGuard();
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const [threadListVersion, setThreadListVersion] = useState(0);
  const [creationFailed, setCreationFailed] = useState(false);
  const [createAttempt, setCreateAttempt] = useState(0);
  const [drivePatientId, setDrivePatientId] = useState<string | null>(null);
  const [driveOpen, setDriveOpen] = useState(() => {
    const mobile = window.matchMedia?.('(max-width: 767px)').matches ?? false;
    try {
      const saved = window.localStorage.getItem('dental.drive.workspace.open.v1');
      return saved === null ? !mobile : saved === 'true';
    } catch {
      return !mobile;
    }
  });
  const [driveDraftSeed, setDriveDraftSeed] = useState<{ name: string; content: string } | null>(
    null,
  );
  const [driveDirty, setDriveDirty] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<(() => void) | null>(null);
  const [savingTransition, setSavingTransition] = useState(false);
  const driveRef = useRef<DriveWorkspaceHandle>(null);
  const composerInsertRef = useRef<(text: string) => void>(() => undefined);
  const createStarted = useRef(false);

  const setDriveVisibility = (open: boolean) => {
    setDriveOpen(open);
    try {
      window.localStorage.setItem('dental.drive.workspace.open.v1', String(open));
    } catch {
      // Storage is optional; the workspace remains available for this session.
    }
    if (!open) {
      window.requestAnimationFrame?.(() => {
        const utility = Array.from(
          document.querySelectorAll<HTMLElement>('[data-drive-utility="true"]'),
        ).find((element) => !element.closest('[inert], [aria-hidden="true"]'));
        utility?.focus();
      });
    }
  };

  useEffect(() => {
    if (!driveDirty) return;
    return transitionGuard.registerBlocker((continuation) => {
      setPendingTransition(() => continuation);
      return true;
    });
  }, [driveDirty, transitionGuard]);

  useEffect(() => {
    if (!driveDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [driveDirty]);

  const cancelDirtyTransition = () => {
    transitionGuard.cancelTransition();
    setPendingTransition(null);
  };

  const discardAndContinue = () => {
    const continuation = pendingTransition;
    transitionGuard.cancelTransition();
    setPendingTransition(null);
    driveRef.current?.discard();
    continuation?.();
  };

  const saveAndContinue = async () => {
    if (savingTransition) return;
    setSavingTransition(true);
    try {
      const saved = (await driveRef.current?.save()) ?? false;
      if (!saved) return;
      const continuation = pendingTransition;
      transitionGuard.cancelTransition();
      setPendingTransition(null);
      continuation?.();
    } finally {
      setSavingTransition(false);
    }
  };

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
      utilities={[
        {
          id: 'google-drive',
          label: 'Google Drive',
          onActivate: () => setDriveVisibility(true),
        },
      ]}
      secondarySidebarContent={(isCollapsed, onRequestExpand) => (
        <ClinicalThreadList
          activeThreadId={activeId ?? undefined}
          isCollapsed={isCollapsed}
          refreshKey={threadListVersion}
          onRequestExpand={onRequestExpand}
        />
      )}
      workspaceAccessory={
        driveOpen ? (
          <DriveWorkspace
            handleRef={driveRef}
            patientId={drivePatientId}
            draftSeed={driveDraftSeed}
            guardTransition={transitionGuard.guardTransition}
            onInsertToComposer={(text) => composerInsertRef.current(text)}
            onDirtyStateChange={setDriveDirty}
            open={driveOpen}
            onClose={() => {
              const close = () => setDriveVisibility(false);
              transitionGuard.guardTransition(close);
            }}
          />
        ) : null
      }
    >
      {activeId ? (
        <ClinicalAssistantArea
          threadId={activeId}
          onThreadStateChanged={() => setThreadListVersion((version) => version + 1)}
          guardTransition={transitionGuard.guardTransition}
          onActivePatientChange={(patient) => setDrivePatientId(patient?.id ?? null)}
          onComposerInsertReady={(insert) => {
            composerInsertRef.current = insert;
          }}
          onSaveToDrive={setDriveDraftSeed}
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
      {pendingTransition && (
        <AlertDialog open onOpenChange={(open) => !open && cancelDirtyTransition()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
              <AlertDialogDescription>
                Guarda tu documento antes de cambiar de paciente, hilo o sección.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={savingTransition}>Cancelar</AlertDialogCancel>
              <button
                type="button"
                className="drive-btn drive-btn-secondary"
                disabled={savingTransition}
                onClick={discardAndContinue}
              >
                Descartar cambios
              </button>
              <AlertDialogAction
                disabled={savingTransition}
                onClick={(event) => {
                  event.preventDefault();
                  void saveAndContinue();
                }}
              >
                {savingTransition ? 'Guardando…' : 'Guardar cambios'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppShell>
  );
}
