import { type MutableRefObject, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type DriveFile,
  type DriveFileContent,
  type DriveStatus,
  createDriveFile,
  getDriveFile,
  getDriveStatus,
  importDriveCopy,
  listDriveFiles,
  recreateDriveWorkspace,
  searchDriveFiles,
  startDriveOAuth,
  updateDriveFile,
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
import { DriveFileBrowser } from './DriveFileBrowser';
import { DriveWorkspaceHeader } from './DriveWorkspaceHeader';

type OpenDoc = DriveDocumentViewModel;

export interface DriveWorkspaceHandle {
  save: () => Promise<boolean>;
  discard: () => void;
}

export interface DriveWorkspaceProps {
  patientId: string | null;
  draftSeed?: { name: string; content: string } | null;
  onInsertToComposer?: (text: string) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  guardTransition?: (continuation: () => void) => void;
  handleRef?: MutableRefObject<DriveWorkspaceHandle | null>;
  open?: boolean;
  onClose?: () => void;
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
  draftSeed = null,
  onInsertToComposer,
  onDirtyStateChange,
  guardTransition,
  handleRef,
  open = true,
  onClose,
}: DriveWorkspaceProps) {
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [query, setQuery] = useState('');
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [docPhase, setDocPhase] = useState<'opening' | 'ready'>('ready');
  const [mode, setMode] = useState<'viewing' | 'editing'>('viewing');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
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
    const mediaQuery = window.matchMedia?.('(max-width: 1024px)');
    if (!mediaQuery) return;
    const update = () => setIsSheet(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  const dirty = doc
    ? isDriveDocumentDirty({
        localAuthoringContent: doc.content,
        authoringRepresentation: doc.representation,
        persistedPlainTextBaseline: doc.baseline,
      })
    : false;

  useEffect(() => {
    patientIdRef.current = patientId;
  }, [patientId]);

  useEffect(() => {
    onDirtyStateChange?.(dirty);
  }, [dirty, onDirtyStateChange]);

  useEffect(() => {
    let cancelled = false;
    getDriveStatus()
      .then((status) => {
        if (!cancelled) setDriveStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setDebugErrorMessage(null);
          setErrorMessage('No se pudo completar la acción');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDoc(null);
    setMode('viewing');
    setSaved(false);
    setSelectedText('');
    setImported(false);
    setQuery('');
    setSearchSubmitted(false);
    setSearchLoading(false);
  }, [patientId]);

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
    setSelectedText('');
  }, [draftSeed]);

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
    if (!patientId || !nextPageToken) return;
    const page = await listDriveFiles(patientId, nextPageToken);
    setFiles((prev) => [...prev, ...page.files]);
    setNextPageToken(page.next_page_token);
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
    setDoc(null);
    setMode('viewing');
    setSaved(false);
    setConflictOpen(false);
    setSelectedText('');
    setUnknownWrite(false);
    window.requestAnimationFrame?.(() => searchInputRef.current?.focus());
  };

  const handleSave = async (): Promise<boolean> => {
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

  const handleImport = async () => {
    const boundPatientId = patientId;
    if (!boundPatientId || importing) return;
    setImporting(true);
    setImported(false);
    setErrorMessage(null);
    setDebugErrorMessage(null);
    try {
      const sourceFileId = await openDrivePicker(boundPatientId);
      if (!sourceFileId || patientIdRef.current !== boundPatientId) return;

      let managedFile: DriveFileContent | null = null;
      try {
        managedFile = await getDriveFile(sourceFileId, boundPatientId);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      }

      if (managedFile) {
        if (patientIdRef.current !== boundPatientId) return;
        showLoadedFile(managedFile, boundPatientId);
        return;
      }

      await importDriveCopy({
        patient_id: boundPatientId,
        operation_id: newOperationId(),
        source_file_id: sourceFileId,
      });
      if (patientIdRef.current !== boundPatientId) return;
      const page = await listDriveFiles(boundPatientId, undefined);
      if (patientIdRef.current !== boundPatientId) return;
      setFiles(page.files);
      setNextPageToken(page.next_page_token);
      setImported(true);
    } catch (error) {
      setErrorMessage('No se pudo completar la acción');
      if (import.meta.env.DEV) {
        const detail = diagnosticError(error);
        console.error('[DEBUG-google-drive]', detail);
        setDebugErrorMessage(detail);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleInsert = (text: string) => {
    if (!patientId || !doc || doc.boundPatientId !== patientId || !onInsertToComposer) return;
    onInsertToComposer(text);
  };

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { save: handleSave, discard: closeDocNow };
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
      selectedText={selectedText}
      patientId={patientId}
      onBack={closeDoc}
      onModeChange={setMode}
      onSave={() => void handleSave()}
      onInsert={handleInsert}
      setDoc={setDoc}
      setSelectedText={setSelectedText}
      onNameChange={(name) =>
        setDoc((prev) => (prev ? { ...prev, name: normalizeDriveFileName(name) } : prev))
      }
    />
  ) : null;

  if (!driveStatus) return null;

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
    case 'connected':
      connectionContent = !doc && (
        <DriveFileBrowser
          patientId={patientId}
          query={query}
          files={files}
          listLoading={listLoading}
          searchLoading={searchLoading}
          searchSubmitted={searchSubmitted}
          importing={importing}
          imported={imported}
          nextPageToken={nextPageToken}
          onQueryChange={setQuery}
          onSearch={() => void handleSearch()}
          onClearSearch={handleClearSearch}
          onImport={() => void handleImport()}
          onOpen={(file) => void handleOpen(file)}
          onLoadMore={() => void handleLoadMore()}
          searchInputRef={searchInputRef}
        />
      );
  }

  const requestCloseWorkspace = () => {
    const close = () => {
      closeDocNow();
      onClose?.();
    };
    if (doc && dirty && guardTransition) {
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
      <DriveWorkspaceHeader
        status={driveStatus}
        patientId={patientId}
        onClose={requestCloseWorkspace}
      />
      {errorMessage && (
        <Alert>
          <AlertTitle>No se pudo completar la acción</AlertTitle>
          <AlertDescription>
            {debugErrorMessage
              ? `Google Drive: ${debugErrorMessage}`
              : 'Tu trabajo local se conserva.'}
          </AlertDescription>
          {unknownWrite && (
            <AlertDescription>Actualiza la lista antes de volver a guardar.</AlertDescription>
          )}
        </Alert>
      )}
      {doc ? documentView : connectionContent}
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
          <SheetTitle>{doc ? 'Documento' : 'Google Drive'}</SheetTitle>
        </SheetHeader>
        {workspaceContent}
      </SheetContent>
    </Sheet>
  );
}
