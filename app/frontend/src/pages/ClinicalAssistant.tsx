import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useOptionalClinicalRuntime } from '../components/ClinicalRuntimeProvider';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { ClinicalAssistantArea } from '../components/clinical-assistant/ClinicalAssistantArea';
import { ClinicalPendingWork } from '../components/clinical-assistant/ClinicalPendingWork';
import { ClinicalThreadList } from '../components/clinical-assistant/ClinicalThreadList';
import { DriveWorkspace, type DriveWorkspaceHandle } from '../components/drive/DriveWorkspace';
import type { DrivePatientContext } from '../components/drive/editors/types';
import { Button } from '../components/ui/Button';
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
import { useClinicalAssistant } from '../hooks/useClinicalAssistant';
import { TransitionGuardProvider, useTransitionGuard } from '../hooks/useTransitionGuard';
import type { ComposerContextItem, DriveJournalTarget } from '../lib/api';
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
  const location = useLocation();
  const resumeParams = new URLSearchParams(location.hash.slice(1));
  const resumeArtifact = resumeParams.get('artifact');
  const resumeApproval = resumeParams.get('approval');
  const pendingMode = !threadId && new URLSearchParams(location.search).get('view') === 'pending';
  const transitionGuard = useTransitionGuard();
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const [threadListVersion, setThreadListVersion] = useState(0);
  const [creationFailed, setCreationFailed] = useState(false);
  const [createAttempt, setCreateAttempt] = useState(0);
  const [driveSurface, setDriveSurface] = useState<'compact' | 'document'>('compact');
  const [driveOpen, setDriveOpen] = useState(false);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [driveMounted, setDriveMounted] = useState(false);
  const [driveInitialSection, setDriveInitialSection] = useState<'notes' | 'journals'>('notes');
  const [driveJournalTarget, setDriveJournalTarget] = useState<DriveJournalTarget | null>(null);
  const [driveDraftSeed, setDriveDraftSeed] = useState<{ name: string; content: string } | null>(
    null,
  );
  const [driveDirty, setDriveDirty] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<(() => void) | null>(null);
  const [savingTransition, setSavingTransition] = useState(false);
  const driveRef = useRef<DriveWorkspaceHandle>(null);
  const composerInsertRef = useRef<(item: ComposerContextItem) => void>(() => undefined);
  const createStarted = useRef(false);
  const returnToDriveAfterPicker = useRef(false);
  const focusComposerAfterDriveClose = useRef(false);

  const setDriveVisibility = (open: boolean, restoreUtilityFocus = true) => {
    if (open) setDriveMounted(true);
    setDriveOpen(open);
    if (!open && restoreUtilityFocus) {
      window.requestAnimationFrame?.(() => {
        if (focusComposerAfterDriveClose.current) {
          focusComposerAfterDriveClose.current = false;
          document.querySelector<HTMLTextAreaElement>('.clinical-composer-input')?.focus();
          return;
        }
        const utility = Array.from(
          document.querySelectorAll<HTMLElement>('[data-drive-utility="true"]'),
        ).find((element) => !element.closest('[inert], [aria-hidden="true"]'));
        utility?.focus();
      });
    }
  };

  const requestDriveVisibility = (open: boolean) => {
    setDriveVisibility(open);
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
    if (pendingMode || threadId || createStarted.current) return;
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
  }, [createAttempt, navigate, threadId, pendingMode]);

  const activeId = threadId ?? createdThreadId;
  const shared = useOptionalClinicalRuntime();
  const fallback = useClinicalAssistant(shared ? undefined : (activeId ?? undefined));
  const assistant = shared?.controller ?? fallback;
  useEffect(() => {
    if (activeId && shared?.activeThreadId !== activeId) shared?.activate(activeId);
  }, [activeId, shared?.activeThreadId, shared?.activate]);
  const patient = assistant.thread?.active_patient;
  const drivePatient: DrivePatientContext | null = patient
    ? {
        id: patient.id,
        displayName: `${patient.first_name} ${patient.last_name}`,
        rutMasked: patient.rut_masked,
      }
    : null;
  return (
    <AppShell
      showConversations={false}
      clinicalSidebar
      workspaceMode
      workspaceAccessoryMode={driveSurface}
      workspaceAccessoryOpen={driveOpen}
      secondarySidebarContent={(isCollapsed, onRequestExpand, onClose) => (
        <ClinicalThreadList
          activeThreadId={activeId ?? undefined}
          activeTurnRunning={assistant.activeTurnId !== null}
          isCollapsed={isCollapsed}
          refreshKey={threadListVersion}
          onRequestExpand={onRequestExpand}
          onNavigate={onClose}
        />
      )}
      workspaceAccessory={
        driveMounted ? (
          <DriveWorkspace
            handleRef={driveRef}
            patientId={drivePatient?.id ?? null}
            patient={drivePatient}
            onSurfaceChange={setDriveSurface}
            draftSeed={driveDraftSeed}
            guardTransition={transitionGuard.guardTransition}
            onInsertToComposer={(item) => {
              composerInsertRef.current(item);
              focusComposerAfterDriveClose.current =
                window.matchMedia?.('(max-width: 1024px)')?.matches ?? false;
            }}
            onDirtyStateChange={setDriveDirty}
            open={driveOpen}
            onClose={() => requestDriveVisibility(false)}
            initialSection={driveInitialSection}
            initialJournalTarget={driveJournalTarget}
            onJournalTargetConsumed={() => setDriveJournalTarget(null)}
            onSelectPatient={() =>
              transitionGuard.guardTransition(() => {
                returnToDriveAfterPicker.current = true;
                setDriveVisibility(false, false);
                window.requestAnimationFrame(() => setPatientPickerOpen(true));
              })
            }
          />
        ) : null
      }
    >
      {pendingMode && (
        <main className="clinical-assistant-area overflow-y-auto">
          <WorkspaceHeader
            title="Trabajo pendiente"
            actions={
              <Button variant="clinicalSecondary" onClick={() => navigate('/assistant')}>
                Iniciar consulta
              </Button>
            }
          />
          <ClinicalPendingWork />
        </main>
      )}
      <div className={pendingMode ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
        {activeId && (!shared || shared.activeThreadId === activeId) ? (
          <ClinicalAssistantArea
            returnToFicha
            threadId={activeId}
            resumeTarget={
              resumeArtifact
                ? { kind: 'artifact', id: resumeArtifact }
                : resumeApproval
                  ? { kind: 'approval', id: resumeApproval }
                  : undefined
            }
            assistant={assistant}
            onThreadStateChanged={() => setThreadListVersion((version) => version + 1)}
            guardTransition={(continuation) => {
              if (driveRef.current?.preservesPatientSwitch?.()) continuation();
              else transitionGuard.guardTransition(continuation);
            }}
            onComposerInsertReady={(insert) => {
              composerInsertRef.current = insert;
            }}
            driveOpen={driveOpen}
            patientPickerOpen={patientPickerOpen}
            onPatientPickerOpenChange={(open) => {
              setPatientPickerOpen(open);
              if (!open && returnToDriveAfterPicker.current) {
                returnToDriveAfterPicker.current = false;
                setDriveVisibility(true, false);
              }
            }}
            onToggleDrive={() => requestDriveVisibility(!driveOpen)}
            onOpenDriveJournal={(target) => {
              setDriveJournalTarget(target);
              setDriveInitialSection('journals');
              setDriveVisibility(true);
            }}
            onSaveToDrive={(seed) =>
              transitionGuard.guardTransition(() => {
                setDriveDraftSeed(seed);
                setDriveVisibility(true);
              })
            }
          />
        ) : (
          <main className="clinical-assistant-area">
            {creationFailed && (
              <section className="clinical-empty-state" role="alert">
                <h2>No pudimos abrir un hilo clínico</h2>
                <Button
                  variant="clinical"
                  onClick={() => setCreateAttempt((attempt) => attempt + 1)}
                >
                  Reintentar
                </Button>
              </section>
            )}
          </main>
        )}
      </div>
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
