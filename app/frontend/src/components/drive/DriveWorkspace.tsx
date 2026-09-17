import {
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  type DriveFile,
  type DriveFileContent,
  type DriveJournalSummary,
  type DriveJournalTarget,
  type DriveSourceFile,
  type DriveStatus,
  createDriveFile,
  getDriveFile,
  getDriveSource,
  getDriveSourceText,
  getDriveStatus,
  importDriveCopy,
  listDriveFiles,
  listDriveJournals,
  listDriveSources,
  recreateDriveWorkspace,
  searchDriveFiles,
  startDriveOAuth,
  updateDriveFile,
  updateDriveSourceText,
} from '../../lib/api';
import { normalizeDriveFileName, serializeToPlainText } from '../../lib/driveDocument';
import { type AuthoringRepresentation, isDriveDocumentDirty } from '../../lib/driveDocument';
import { openDrivePicker } from '../../lib/drivePicker';
import { Spinner } from '../Spinner';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { DriveDocumentView, type DriveDocumentViewModel } from './DriveDocumentView';
import { DriveDocumentWorkspace } from './DriveDocumentWorkspace';
import { DriveFileBrowser } from './DriveFileBrowser';
import { DriveJournalPanel } from './DriveJournalPanel';
import { DriveWorkspaceHeader } from './DriveWorkspaceHeader';
import { DriveWorkspaceHome } from './DriveWorkspaceHome';
import type { DrivePatientContext, WorkspaceDocument } from './editors/types';

type OpenDoc = DriveDocumentViewModel;
export type DriveSection = 'notes' | 'documents' | 'journals';

export interface DriveWorkspaceHandle {
  save: () => Promise<boolean>;
  discard: () => void;
  preservesPatientSwitch?: () => boolean;
}

export interface DriveWorkspaceProps {
  patientId: string | null;
  patient?: DrivePatientContext | null;
  onSurfaceChange?: (surface: 'compact' | 'document') => void;
  draftSeed?: { name: string; content: string } | null;
  onInsertToComposer?: (item: import('../../lib/api').ComposerContextItem) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  guardTransition?: (continuation: () => void) => void;
  handleRef?: MutableRefObject<DriveWorkspaceHandle | null>;
  open?: boolean;
  onClose?: () => void;
  initialSection?: DriveSection;
  initialJournalTarget?: DriveJournalTarget | null;
  onJournalTargetConsumed?: () => void;
}

function newOperationId(): string {
  return crypto.randomUUID();
}

function normalizeLocalContentAfterSave(
  content: string,
  representation: AuthoringRepresentation,
): string {
  if (representation === 'persisted_plain_text') return content;
  return `${content.replace(/\r\n?/g, '\n').replace(/\n+$/, '')}\n`;
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return null;
  const body = error.body as { error?: unknown; detail?: unknown };
  if (typeof body.error === 'string') return body.error;
  if (body.detail && typeof body.detail === 'object' && 'code' in body.detail) {
    const code = (body.detail as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function diagnosticError(error: unknown): string {
  if (error instanceof ApiError) return `API error ${error.status}`;
  if (error instanceof Error && error.message.length <= 120) return error.message;
  return 'unknown error';
}

export function DriveWorkspace({
  patientId,
  patient = null,
  onSurfaceChange,
  draftSeed = null,
  onInsertToComposer,
  onDirtyStateChange,
  guardTransition,
  handleRef,
  open = true,
  onClose,
  initialSection = 'notes',
  initialJournalTarget = null,
  onJournalTargetConsumed,
}: DriveWorkspaceProps) {
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [query, setQuery] = useState('');
  const [workspaceDocument, setWorkspaceDocument] = useState<WorkspaceDocument | null>(null);
  const doc = workspaceDocument?.kind === 'managed' ? workspaceDocument.document : null;
  const sourceDoc = workspaceDocument?.kind === 'source' ? workspaceDocument : null;
  const setDoc = (action: SetStateAction<OpenDoc | null>) =>
    setWorkspaceDocument((previous) => {
      const managed = previous?.kind === 'managed' ? previous.document : null;
      const next = typeof action === 'function' ? action(managed) : action;
      return next ? { kind: 'managed', document: next } : null;
    });
  const [sources, setSources] = useState<DriveSourceFile[]>([]);
  const [sourcePage, setSourcePage] = useState<string | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [section, setSection] = useState<DriveSection>(initialSection);
  const [journals, setJournals] = useState<DriveJournalSummary[]>([]);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [journalsLoaded, setJournalsLoaded] = useState(false);
  const openSequence = useRef(0);
  const statusSequence = useRef(0);
  const pageRequestInFlight = useRef(false);
  const [docPhase, setDocPhase] = useState<'opening' | 'ready'>('ready');
  const [mode, setMode] = useState<'viewing' | 'editing'>('viewing');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [insertionFeedback, setInsertionFeedback] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [unknownWrite, setUnknownWrite] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugErrorMessage, setDebugErrorMessage] = useState<string | null>(null);
  const [recreateDialog, setRecreateDialog] = useState<'missing' | 'recovery' | null>(null);
  const patientIdRef = useRef(patientId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);
  const [isSheet, setIsSheet] = useState(
    () => window.matchMedia?.('(max-width: 1024px)')?.matches ?? false,
  );

  useEffect(() => {
    setSection(initialJournalTarget ? 'journals' : initialSection);
  }, [initialJournalTarget, initialSection]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 1024px)');
    if (!mediaQuery) return;
    const update = () => setIsSheet(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  const dirty = sourceDoc
    ? sourceDoc.content !== sourceDoc.baseline
    : doc
      ? isDriveDocumentDirty({
          localAuthoringContent: doc.content,
          authoringRepresentation: doc.representation,
          persistedPlainTextBaseline: doc.baseline,
        })
      : false;

  useEffect(() => {
    patientIdRef.current = patientId;
    pageRequestInFlight.current = false;
  }, [patientId]);

  useEffect(() => {
    onDirtyStateChange?.(dirty);
  }, [dirty, onDirtyStateChange]);

  const loadDriveStatus = async () => {
    const sequence = ++statusSequence.current;
    setStatusLoading(true);
    setErrorMessage(null);
    try {
      const status = await getDriveStatus();
      if (sequence === statusSequence.current) setDriveStatus(status);
    } catch {
      if (sequence === statusSequence.current) {
        setDriveStatus(null);
        setDebugErrorMessage(null);
        setErrorMessage('No se pudo completar la acción');
      }
    } finally {
      if (sequence === statusSequence.current) setStatusLoading(false);
    }
  };

  useEffect(() => {
    void loadDriveStatus();
    return () => {
      statusSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    setWorkspaceDocument((previous) => (previous?.kind === 'source' ? previous : null));
    setMode('viewing');
    setSaved(false);
    setSelectedText('');
    setImported(false);
    setInsertionFeedback(null);
    setQuery('');
    setSearchSubmitted(false);
    setSearchLoading(false);
  }, [patientId]);

  useEffect(() => {
    onSurfaceChange?.(workspaceDocument ? 'document' : 'compact');
  }, [Boolean(workspaceDocument), onSurfaceChange]);

  const loadSources = async (pageToken?: string) => {
    setSourcesLoading(true);
    try {
      const page = await listDriveSources(pageToken);
      setSources((previous) =>
        pageToken
          ? [
              ...previous,
              ...page.files.filter((file) => !previous.some((item) => item.id === file.id)),
            ]
          : page.files,
      );
      setSourcePage(page.next_page_token);
    } catch {
      setErrorMessage('No se pudieron cargar las fuentes.');
    } finally {
      setSourcesLoading(false);
    }
  };

  useEffect(() => {
    if (driveStatus?.status === 'connected') void loadSources();
  }, [driveStatus?.status]);

  const loadJournals = async () => {
    setJournalsLoading(true);
    try {
      const page = await listDriveJournals();
      setJournals(page.journals);
      setJournalsLoaded(true);
    } catch {
      setErrorMessage('No se pudieron cargar los diarios.');
    } finally {
      setJournalsLoading(false);
    }
  };

  useEffect(() => {
    if (driveStatus?.status === 'connected' && section === 'journals' && !journalsLoaded) {
      void loadJournals();
    }
  }, [driveStatus?.status, journalsLoaded, section]);

  const openSource = async (fileId: string): Promise<string | null> => {
    const sequence = ++openSequence.current;
    setDocPhase('opening');
    setErrorMessage(null);
    setInsertionFeedback(null);
    try {
      let source = await getDriveSource(fileId);
      let content = '';
      if (source.kind === 'text' || source.kind === 'markdown') {
        const loaded = await getDriveSourceText(fileId);
        source = loaded;
        content = loaded.content;
      }
      if (sequence !== openSequence.current) return null;
      setWorkspaceDocument({ kind: 'source', source, content, baseline: content });
      setUnknownWrite(false);
      setConflictOpen(false);
      setSources((previous) => [source, ...previous.filter((file) => file.id !== source.id)]);
      return null;
    } catch (error) {
      if (sequence === openSequence.current) setErrorMessage('No se pudo abrir el documento.');
      return apiErrorCode(error);
    } finally {
      if (sequence === openSequence.current) setDocPhase('ready');
    }
  };

  useEffect(() => {
    if (!draftSeed) return;
    setDoc({
      fileId: null,
      boundPatientId: patientId,
      name: normalizeDriveFileName(draftSeed.name),
      version: null,
      mimeType: 'text/plain',
      content: draftSeed.content,
      baseline: null,
      representation: 'local_markdown',
    });
    setMode('editing');
    setDocPhase('ready');
    setSaved(false);
    setInsertionFeedback(null);
    setSelectedText('');
  }, [draftSeed]);

  useEffect(() => {
    if (!initialJournalTarget || !workspaceDocument) return;
    const openJournal = () => {
      closeDocNow();
      setSection('journals');
    };
    if (dirty && guardTransition) guardTransition(openJournal);
    else openJournal();
  }, [
    initialJournalTarget?.evolutionId,
    initialJournalTarget?.journal.period_key,
    initialJournalTarget?.journal.period_type,
    initialJournalTarget?.journal.journal_part,
    Boolean(workspaceDocument),
    dirty,
    guardTransition,
  ]);

  useEffect(() => {
    if (!patientId || driveStatus?.status !== 'connected') return;
    let cancelled = false;
    setListLoading(true);
    setFiles([]);
    setNextPageToken(null);
    listDriveFiles(patientId, undefined)
      .then((page) => {
        if (cancelled || patientIdRef.current !== patientId) return;
        setFiles(page.files);
        setNextPageToken(page.next_page_token);
      })
      .catch(() => {
        if (!cancelled) {
          setDebugErrorMessage(null);
          setErrorMessage('No se pudo completar la acción');
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, driveStatus?.status]);

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMessage(null);
    try {
      const { authorization_url } = await startDriveOAuth();
      try {
        window.location.assign(authorization_url);
      } catch {
        // jsdom/test navigation is unavailable; the handoff contract is the single assign call.
      }
    } catch {
      setConnecting(false);
      setDebugErrorMessage(null);
      setErrorMessage('No se pudo completar la acción');
    }
  };

  const handleSearch = async () => {
    if (!patientId) return;
    const trimmed = query.trim();
    const sequence = ++searchSequence.current;
    setSearchSubmitted(Boolean(trimmed));
    setSearchLoading(true);
    try {
      const page = trimmed
        ? await searchDriveFiles({ patient_id: patientId, query: trimmed })
        : await listDriveFiles(patientId, undefined);
      if (sequence !== searchSequence.current || patientIdRef.current !== patientId) return;
      setFiles(page.files);
      setNextPageToken(page.next_page_token);
    } catch {
      if (sequence === searchSequence.current) {
        setDebugErrorMessage(null);
        setErrorMessage('No se pudo completar la acción');
      }
    } finally {
      if (sequence === searchSequence.current) setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!patientId || driveStatus?.status !== 'connected' || !query.trim()) return;
    const timer = window.setTimeout(() => void handleSearch(), 300);
    return () => window.clearTimeout(timer);
  }, [query, patientId, driveStatus?.status]);

  const handleClearSearch = () => {
    searchSequence.current += 1;
    setQuery('');
    setSearchSubmitted(false);
    setSearchLoading(false);
    if (!patientId) return;
    setListLoading(true);
    void listDriveFiles(patientId, undefined)
      .then((page) => {
        if (patientIdRef.current !== patientId) return;
        setFiles(page.files);
        setNextPageToken(page.next_page_token);
      })
      .catch(() => {
        setDebugErrorMessage(null);
        setErrorMessage('No se pudo completar la acción');
      })
      .finally(() => setListLoading(false));
  };

  const handleLoadMore = async () => {
    if (!patientId || !nextPageToken || pageRequestInFlight.current) return;
    const requestedPatient = patientId;
    const requestedCursor = nextPageToken;
    pageRequestInFlight.current = true;
    try {
      const page = await listDriveFiles(requestedPatient, requestedCursor);
      if (patientIdRef.current !== requestedPatient) return;
      setFiles((prev) => [...prev, ...page.files]);
      setNextPageToken(page.next_page_token);
    } catch {
      if (patientIdRef.current === requestedPatient) {
        setDebugErrorMessage(null);
        setErrorMessage('No se pudo completar la acción');
      }
    } finally {
      if (patientIdRef.current === requestedPatient) {
        pageRequestInFlight.current = false;
      }
    }
  };

  const showLoadedFile = (content: DriveFileContent, boundPatientId: string): void => {
    setDoc({
      fileId: content.id,
      boundPatientId,
      name: content.name,
      version: content.version,
      mimeType: content.mimeType,
      content: content.content,
      baseline: content.content,
      representation: 'persisted_plain_text',
    });
    setDocPhase('ready');
    setMode('viewing');
    setSaved(false);
    setImported(false);
    setInsertionFeedback(null);
    setSelectedText('');
  };

  const handleOpen = async (file: DriveFile) => {
    if (!patientId) return;
    const boundPatientId = patientId;
    setDoc({
      fileId: file.id,
      boundPatientId,
      name: file.name,
      version: file.version,
      mimeType: file.mimeType,
      content: '',
      baseline: null,
      representation: 'persisted_plain_text',
    });
    setDocPhase('opening');
    setMode('viewing');
    setSaved(false);
    setInsertionFeedback(null);
    try {
      const content = await getDriveFile(file.id, patientId);
      if (patientIdRef.current === boundPatientId) {
        showLoadedFile(content, boundPatientId);
      }
    } catch {
      setDoc(null);
      setDebugErrorMessage(null);
      setErrorMessage('No se pudo completar la acción');
    } finally {
      setDocPhase('ready');
    }
  };

  const closeDoc = () => {
    if (dirty && guardTransition) {
      guardTransition(closeDocNow);
      return;
    }
    closeDocNow();
  };

  const closeDocNow = () => {
    openSequence.current += 1;
    setDoc(null);
    setMode('viewing');
    setSaved(false);
    setConflictOpen(false);
    setSelectedText('');
    setInsertionFeedback(null);
    setUnknownWrite(false);
    window.requestAnimationFrame?.(() => searchInputRef.current?.focus());
  };

  const handleSave = async (): Promise<boolean> => {
    if (sourceDoc) {
      if (saving || unknownWrite || conflictOpen || !sourceDoc.source.editable) return false;
      setSaving(true);
      try {
        const updated = await updateDriveSourceText(sourceDoc.source.id, sourceDoc.content);
        setWorkspaceDocument((previous) =>
          previous?.kind === 'source' && previous.source.id === updated.id
            ? { ...previous, source: updated, baseline: sourceDoc.content }
            : previous,
        );
        setErrorMessage(null);
        return true;
      } catch (error) {
        setConflictOpen(false);
        setUnknownWrite(!(error instanceof ApiError) || error.status >= 500);
        setErrorMessage('No se pudo confirmar el guardado. Tu trabajo local se conserva.');
        return false;
      } finally {
        setSaving(false);
      }
    }
    if (!doc || !patientId || doc.boundPatientId !== patientId) return false;
    const exportContent = serializeToPlainText(doc.content, doc.representation);
    const savedLocalContent = normalizeLocalContentAfterSave(doc.content, doc.representation);
    const operationId = newOperationId();
    setSaving(true);
    setSaved(false);
    setUnknownWrite(false);
    setErrorMessage(null);
    setDebugErrorMessage(null);
    try {
      if (doc.fileId === null) {
        const created = await createDriveFile({
          patient_id: patientId,
          operation_id: operationId,
          name: normalizeDriveFileName(doc.name),
          content: exportContent,
        });
        setDoc((prev) =>
          prev && prev.fileId === null
            ? {
                ...prev,
                fileId: created.id,
                version: created.version,
                mimeType: created.mimeType,
                content: savedLocalContent,
                baseline: exportContent,
              }
            : prev,
        );
      } else {
        const updated = await updateDriveFile(doc.fileId, {
          patient_id: patientId,
          operation_id: operationId,
          content: exportContent,
          expected_version: doc.version ?? '0',
        });
        setDoc((prev) =>
          prev && prev.fileId === doc.fileId
            ? {
                ...prev,
                content: savedLocalContent,
                version: updated.version,
                mimeType: updated.mimeType,
                baseline: exportContent,
              }
            : prev,
        );
      }
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictOpen(true);
      } else {
        setUnknownWrite(apiErrorCode(err) === 'DRIVE_WRITE_UNKNOWN');
        setDebugErrorMessage(null);
        setErrorMessage('No se pudo completar la acción');
      }
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  };

  const handleViewCurrentVersion = async () => {
    if (sourceDoc) {
      const reload = () => void openSource(sourceDoc.source.id);
      guardTransition ? guardTransition(reload) : reload();
      return;
    }
    if (!doc?.fileId || !patientId) return;
    setConflictOpen(false);
    try {
      const latest = await getDriveFile(doc.fileId, patientId);
      setDoc((prev) =>
        prev && prev.fileId === doc.fileId
          ? { ...prev, version: latest.version, baseline: latest.content }
          : prev,
      );
    } catch {
      setDebugErrorMessage(null);
      setErrorMessage('No se pudo completar la acción');
    }
  };

  const handleRecreate = async () => {
    const dialog = recreateDialog;
    setRecreateDialog(null);
    if (!dialog) return;
    try {
      const status = await recreateDriveWorkspace(newOperationId(), true);
      if (status) setDriveStatus(status);
    } catch {
      setDebugErrorMessage(null);
      setErrorMessage('No se pudo completar la acción');
    }
  };

  const handleOpenNote = async () => {
    if (importing) return;
    setErrorMessage(null);
    setDebugErrorMessage(null);
    setUnknownWrite(false);
    setImporting(true);
    try {
      const picked = await openDrivePicker();
      if (picked) {
        const errorCode = await openSource(picked.id);
        if (errorCode === 'DRIVE_SOURCE_ALREADY_MANAGED') {
          setErrorMessage('Este archivo ya pertenece al Workspace. Ábrelo desde Documentos.');
        } else if (errorCode === 'DRIVE_FILE_TYPE_UNSUPPORTED') {
          setErrorMessage('Este tipo de archivo no se puede abrir como nota.');
        }
      }
    } catch {
      setErrorMessage('No se pudo abrir el selector de Drive.');
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!patientId || importing) return;
    setErrorMessage(null);
    setDebugErrorMessage(null);
    setUnknownWrite(false);
    setImporting(true);
    try {
      const picked = await openDrivePicker(patientId);
      if (picked) {
        const importedFile = await importDriveCopy({
          patient_id: patientId,
          operation_id: newOperationId(),
          source_file_id: picked.id,
        });
        setFiles((previous) => [
          importedFile,
          ...previous.filter((file) => file.id !== importedFile.id),
        ]);
        setImported(true);
      }
    } catch {
      setErrorMessage('No se pudo importar la copia desde Drive.');
    } finally {
      setImporting(false);
    }
  };

  const handleInsert = (
    text: string,
    sourceId: string,
    sourceName: string,
    boundPatientId?: string | null,
  ) => {
    if (
      !text ||
      !patientId ||
      !onInsertToComposer ||
      (boundPatientId !== undefined && boundPatientId !== patientId)
    )
      return;
    try {
      onInsertToComposer({
        id: crypto.randomUUID(),
        kind: 'drive_selection',
        sourceId,
        sourceName: sourceName.replace(/\s+/g, ' ').trim() || 'Nota de Drive',
        content: text,
      });
      setInsertionFeedback('Incorporado al borrador');
      setErrorMessage(null);
    } catch {
      setInsertionFeedback(null);
      setErrorMessage('No se pudo añadir el contenido al borrador.');
    }
  };

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      save: handleSave,
      discard: closeDocNow,
      preservesPatientSwitch: () => Boolean(sourceDoc),
    };
    return () => {
      if (handleRef.current?.save === handleSave) handleRef.current = null;
    };
  });

  const documentView = doc ? (
    <DriveDocumentView
      doc={doc}
      docPhase={docPhase}
      mode={mode}
      saving={saving}
      saved={saved}
      dirty={dirty}
      selectedText={selectedText}
      patientId={patientId}
      onBack={closeDoc}
      onModeChange={setMode}
      onSave={() => void handleSave()}
      onInsert={(text) => handleInsert(text, doc.fileId ?? doc.name, doc.name, doc.boundPatientId)}
      setDoc={setDoc}
      setSelectedText={setSelectedText}
      onNameChange={(name) =>
        setDoc((prev) => (prev ? { ...prev, name: normalizeDriveFileName(name) } : prev))
      }
    />
  ) : null;

  if (!driveStatus) {
    if (statusLoading) return null;
    return (
      <Alert>
        <AlertTitle>Google Drive no está disponible</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
        <button type="button" className="drive-btn drive-btn-primary" onClick={loadDriveStatus}>
          Reintentar
        </button>
      </Alert>
    );
  }

  const sectionNavigation = (
    <nav className="drive-section-nav" aria-label="Secciones de Google Drive">
      {(
        [
          ['notes', 'Notas'],
          ['documents', 'Documentos'],
          ['journals', 'Diarios'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          className="drive-section-button"
          aria-pressed={section === value}
          onClick={() => {
            setSection(value);
            setErrorMessage(null);
            setDebugErrorMessage(null);
            setUnknownWrite(false);
            setInsertionFeedback(null);
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );

  const journalContent = (
    <DriveJournalPanel
      journals={journals}
      loading={journalsLoading}
      initialTarget={initialJournalTarget}
      onInitialTargetConsumed={onJournalTargetConsumed}
    />
  );

  let connectionContent: ReactNode;
  switch (driveStatus.status) {
    case 'unconfigured':
      connectionContent = (
        <Alert>
          <AlertTitle>Google Drive no está disponible</AlertTitle>
          <AlertDescription>La integración no está configurada en este entorno.</AlertDescription>
        </Alert>
      );
      break;
    case 'disconnected':
      connectionContent = (
        <div className="drive-onboarding">
          <h2 className="drive-onboarding-title">Conecta Google Drive</h2>
          <p className="drive-onboarding-copy">
            Trabaja con documentos asociados al paciente sin salir del Asistente Clínico.
          </p>
          <button
            type="button"
            className="drive-btn drive-btn-primary drive-onboarding-action"
            onClick={() => void handleConnect()}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <Spinner /> Conectando…
              </>
            ) : (
              'Conectar Google Drive'
            )}
          </button>
          <p className="drive-onboarding-secondary">
            Dental AI Assistant sólo administrará los archivos que cree o importes explícitamente.
          </p>
        </div>
      );
      break;
    case 'revoked':
      connectionContent = (
        <Alert>
          <AlertTitle>Vuelve a conectar Google Drive</AlertTitle>
          <AlertDescription>
            El acceso al workspace dejó de estar disponible. Tu sesión de Dental AI Assistant
            continúa activa.
          </AlertDescription>
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            onClick={() => void handleConnect()}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <Spinner /> Conectando…
              </>
            ) : (
              'Reconectar'
            )}
          </button>
        </Alert>
      );
      break;
    case 'workspace_missing':
      connectionContent = (
        <Alert>
          <AlertTitle>Workspace no disponible</AlertTitle>
          <AlertDescription>
            La carpeta administrada anteriormente no se puede verificar.
          </AlertDescription>
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            onClick={() => setRecreateDialog('missing')}
          >
            Ver opciones
          </button>
        </Alert>
      );
      break;
    case 'workspace_recovery_pending':
      connectionContent = (
        <Alert>
          <AlertTitle>Revisión del workspace pendiente</AlertTitle>
          <AlertDescription>
            Google Drive podría haber creado una carpeta que Dental AI Assistant todavía no puede
            verificar. Revisa las opciones antes de crear otra.
          </AlertDescription>
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            onClick={() => setRecreateDialog('recovery')}
          >
            Ver opciones
          </button>
        </Alert>
      );
      break;
    case 'unavailable':
      connectionContent = (
        <Alert>
          <AlertTitle>Google Drive no está disponible</AlertTitle>
          <AlertDescription>Intenta nuevamente en unos minutos.</AlertDescription>
          <button type="button" className="drive-btn drive-btn-primary" onClick={loadDriveStatus}>
            Reintentar
          </button>
        </Alert>
      );
      break;
    case 'connected':
      connectionContent = !workspaceDocument && (
        <>
          {sectionNavigation}
          {section === 'notes' ? (
            <DriveWorkspaceHome
              files={sources}
              patient={patient}
              loading={sourcesLoading}
              picking={importing}
              onPick={() => void handleOpenNote()}
              onOpen={(file) => void openSource(file.id)}
              onMore={sourcePage ? () => void loadSources(sourcePage) : undefined}
            />
          ) : section === 'documents' ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <DriveFileBrowser
                managedOnly
                patientId={patientId}
                patient={patient}
                query={query}
                files={files}
                listLoading={listLoading}
                searchLoading={searchLoading}
                searchSubmitted={searchSubmitted}
                importing={importing}
                imported={imported}
                importLabel="Importar copia desde Drive"
                nextPageToken={nextPageToken}
                onQueryChange={setQuery}
                onSearch={() => void handleSearch()}
                onClearSearch={handleClearSearch}
                onImport={() => void handleImport()}
                onOpen={(file) => void handleOpen(file)}
                onLoadMore={() => void handleLoadMore()}
                searchInputRef={searchInputRef}
              />
            </div>
          ) : (
            journalContent
          )}
        </>
      );
  }

  const requestCloseWorkspace = () => {
    const close = () => {
      closeDocNow();
      onClose?.();
    };
    if (workspaceDocument && dirty && guardTransition) {
      guardTransition(close);
      return;
    }
    close();
  };

  const conflictView = conflictOpen ? (
    <Alert>
      <AlertTitle>El documento cambió</AlertTitle>
      <AlertDescription>
        Otra versión del documento se guardó en Google Drive. Tu texto local se conserva.
      </AlertDescription>
      <div className="drive-alert-actions">
        <button
          type="button"
          className="drive-btn drive-btn-secondary"
          onClick={() => setConflictOpen(false)}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="drive-btn drive-btn-primary"
          onClick={() => void handleViewCurrentVersion()}
        >
          Ver versión actual
        </button>
      </div>
    </Alert>
  ) : null;

  const workspaceContent = (
    <div
      className="drive-workspace"
      role="region"
      aria-label="Espacio de documentos de Google Drive"
    >
      {!isSheet && (
        <DriveWorkspaceHeader
          status={driveStatus}
          patient={patient}
          onClose={requestCloseWorkspace}
        />
      )}
      {errorMessage && !conflictOpen && (
        <Alert>
          <AlertTitle>
            {sourceDoc ? 'No se pudo guardar el documento' : 'No se pudo completar la acción'}
          </AlertTitle>
          <AlertDescription>
            {debugErrorMessage
              ? `Google Drive: ${debugErrorMessage}`
              : errorMessage === 'No se pudo completar la acción'
                ? 'Tu trabajo local se conserva.'
                : errorMessage}
          </AlertDescription>
          {unknownWrite && (
            <AlertDescription>Actualiza la lista antes de volver a guardar.</AlertDescription>
          )}
        </Alert>
      )}
      {insertionFeedback && (
        <p
          className="drive-insertion-feedback"
          role="status"
          aria-label={insertionFeedback}
          aria-live="polite"
        >
          {insertionFeedback}
        </p>
      )}
      {docPhase === 'opening' && !doc && (
        <div role="status" aria-label="Abriendo documento" className="drive-file-skeleton">
          <span />
          <span />
        </div>
      )}
      {sourceDoc ? (
        <DriveDocumentWorkspace
          key={sourceDoc.source.id}
          document={sourceDoc}
          patient={patient}
          saving={saving}
          showClose={false}
          onBack={closeDoc}
          onClose={requestCloseWorkspace}
          onSave={() => void handleSave()}
          onInsert={(text) => handleInsert(text, sourceDoc.source.id, sourceDoc.source.name)}
          onChange={(content) =>
            setWorkspaceDocument((previous) =>
              previous?.kind === 'source' ? { ...previous, content } : previous,
            )
          }
        />
      ) : doc ? (
        documentView
      ) : (
        connectionContent
      )}
      {conflictView}
      <AlertDialog
        open={recreateDialog !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRecreateDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recrear workspace</AlertDialogTitle>
            <AlertDialogDescription>
              {recreateDialog === 'recovery'
                ? 'Podría existir una carpeta anterior no administrada. Si aparece después, deberás eliminarla manualmente desde Google Drive.'
                : 'Se creará una nueva carpeta Dental AI Assistant. Los archivos de la carpeta anterior no se eliminarán.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRecreate()}>
              Recrear workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (!isSheet) return open ? workspaceContent : null;

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && requestCloseWorkspace()}>
      <SheetContent className="drive-sheet-workspace">
        <SheetHeader>
          <SheetTitle>{workspaceDocument ? 'Documento' : 'Google Drive'}</SheetTitle>
          {driveStatus.status === 'connected' && <p className="drive-header-status">Conectado</p>}
          {patient && (
            <p className="drive-workspace-patient-context">
              Contexto activo · {patient.displayName} · {patient.rutMasked}
            </p>
          )}
        </SheetHeader>
        {workspaceContent}
      </SheetContent>
    </Sheet>
  );
}
