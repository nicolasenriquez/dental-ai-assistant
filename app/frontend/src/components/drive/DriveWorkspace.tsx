import { type MutableRefObject, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  type DriveFile,
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
import { MarkdownRenderer } from '../MarkdownRenderer';
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
import { ScrollArea } from '../ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

interface OpenDoc {
  fileId: string | null;
  boundPatientId: string | null;
  name: string;
  version: string | null;
  content: string;
  baseline: string | null;
  representation: AuthoringRepresentation;
}

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

export function DriveWorkspace({
  patientId,
  draftSeed = null,
  onInsertToComposer,
  onDirtyStateChange,
  guardTransition,
  handleRef,
}: DriveWorkspaceProps) {
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
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
  const [recreateDialog, setRecreateDialog] = useState<'missing' | 'recovery' | null>(null);
  const patientIdRef = useRef(patientId);
  const isMobile = useMemo(() => window.matchMedia?.('(max-width: 767px)')?.matches ?? false, []);

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
        if (!cancelled) setErrorMessage('No se pudo completar la acción');
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
  }, [patientId]);

  useEffect(() => {
    if (!draftSeed) return;
    setDoc({
      fileId: null,
      boundPatientId: patientId,
      name: normalizeDriveFileName(draftSeed.name),
      version: null,
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
        if (!cancelled) setErrorMessage('No se pudo completar la acción');
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
      setErrorMessage('No se pudo completar la acción');
    }
  };

  const handleSearch = async () => {
    if (!patientId) return;
    const trimmed = query.trim();
    if (!trimmed) {
      const page = await listDriveFiles(patientId, undefined);
      setFiles(page.files);
      setNextPageToken(page.next_page_token);
      return;
    }
    const page = await searchDriveFiles({ patient_id: patientId, query: trimmed });
    setFiles(page.files);
    setNextPageToken(page.next_page_token);
  };

  const handleLoadMore = async () => {
    if (!patientId || !nextPageToken) return;
    const page = await listDriveFiles(patientId, nextPageToken);
    setFiles((prev) => [...prev, ...page.files]);
    setNextPageToken(page.next_page_token);
  };

  const handleOpen = async (file: DriveFile) => {
    if (!patientId) return;
    const boundPatientId = patientId;
    setDoc({
      fileId: file.id,
      boundPatientId,
      name: file.name,
      version: file.version,
      content: '',
      baseline: null,
      representation: 'persisted_plain_text',
    });
    setDocPhase('opening');
    setMode('viewing');
    setSaved(false);
    try {
      const content = await getDriveFile(file.id, patientId);
      setDoc((prev) =>
        prev && prev.fileId === file.id && prev.boundPatientId === boundPatientId
          ? {
              ...prev,
              content: content.content,
              baseline: content.content,
              version: content.version,
            }
          : prev,
      );
    } catch {
      setDoc(null);
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
      setErrorMessage('No se pudo completar la acción');
    }
  };

  const handleImport = async () => {
    const boundPatientId = patientId;
    if (!boundPatientId || importing) return;
    setImporting(true);
    setImported(false);
    setErrorMessage(null);
    try {
      const sourceFileId = await openDrivePicker(boundPatientId);
      if (!sourceFileId || patientIdRef.current !== boundPatientId) return;
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
    } catch {
      setErrorMessage('No se pudo completar la acción');
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
    <div className="drive-doc">
      <div className="drive-doc-header">
        <button type="button" className="drive-btn drive-btn-secondary" onClick={closeDoc}>
          Volver
        </button>
        {doc.fileId === null ? (
          <label className="drive-doc-name-input">
            Nombre del documento
            <input
              type="text"
              value={doc.name}
              onChange={(event) =>
                setDoc((prev) =>
                  prev ? { ...prev, name: normalizeDriveFileName(event.target.value) } : prev,
                )
              }
            />
          </label>
        ) : (
          <span className="drive-doc-name">{doc.name}</span>
        )}
        <span className="drive-doc-format">TXT</span>
        <div className="drive-doc-modes" role="group" aria-label="Modo de visualización">
          <button
            type="button"
            aria-pressed={mode === 'viewing'}
            onClick={() => setMode('viewing')}
          >
            Vista previa
          </button>
          <button
            type="button"
            aria-pressed={mode === 'editing'}
            onClick={() => setMode('editing')}
          >
            Editar
          </button>
        </div>
        {onInsertToComposer && (
          <div className="drive-doc-transfer-actions">
            {mode === 'editing' && selectedText && (
              <button
                type="button"
                className="drive-btn drive-btn-secondary"
                disabled={!patientId || doc.boundPatientId !== patientId}
                onClick={() => handleInsert(selectedText)}
              >
                Insertar selección en el chat
              </button>
            )}
            <button
              type="button"
              className="drive-btn drive-btn-secondary"
              disabled={!patientId || doc.boundPatientId !== patientId}
              onClick={() => handleInsert(doc.content)}
            >
              Insertar en el chat
            </button>
          </div>
        )}
        {mode === 'editing' && (
          <button
            type="button"
            className="drive-btn drive-btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner /> Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </button>
        )}
        {saved && (
          <span className="drive-doc-saved" role="status">
            Guardado
          </span>
        )}
      </div>
      <ScrollArea className="drive-doc-body">
        {docPhase === 'opening' ? (
          <p className="drive-doc-status">Abriendo…</p>
        ) : mode === 'editing' ? (
          <textarea
            aria-label="Contenido del documento"
            className="drive-doc-editor"
            value={doc.content}
            onChange={(event) =>
              setDoc((prev) => (prev ? { ...prev, content: event.target.value } : prev))
            }
            onSelect={(event) => {
              const target = event.currentTarget;
              setSelectedText(target.value.slice(target.selectionStart, target.selectionEnd));
            }}
          />
        ) : doc.representation === 'persisted_plain_text' ? (
          <pre className="drive-doc-pre">{doc.content}</pre>
        ) : (
          <MarkdownRenderer content={doc.content} />
        )}
      </ScrollArea>
    </div>
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
      connectionContent = (
        <>
          <div className="drive-header">
            <h2 className="drive-header-title">Google Drive</h2>
            <span className="drive-header-status">Conectado</span>
            <span className="drive-header-workspace">
              {driveStatus.workspace?.folder_name ?? 'Dental AI Assistant'}
            </span>
          </div>
          {patientId ? (
            <>
              <div className="drive-list-tools">
                <input
                  type="search"
                  className="drive-search"
                  aria-label="Buscar documentos"
                  placeholder="Buscar documentos"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSearch();
                  }}
                />
                <button
                  type="button"
                  className="drive-btn drive-btn-secondary"
                  onClick={() => void handleImport()}
                  disabled={importing}
                >
                  {importing ? 'Importando…' : 'Importar una copia'}
                </button>
                {imported && (
                  <span className="drive-doc-saved" role="status">
                    Copia importada
                  </span>
                )}
              </div>
              {doc ? null : (
                <div className="drive-list">
                  {listLoading ? (
                    <p className="drive-list-status">Cargando documentos…</p>
                  ) : files.length === 0 ? (
                    <p className="drive-list-status">No hay documentos para este paciente.</p>
                  ) : (
                    <>
                      <ul className="drive-file-list">
                        {files.map((file) => (
                          <li key={file.id}>
                            <button type="button" onClick={() => void handleOpen(file)}>
                              {file.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {nextPageToken && (
                        <button
                          type="button"
                          className="drive-btn drive-btn-secondary"
                          onClick={() => void handleLoadMore()}
                        >
                          Cargar más
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : null}
        </>
      );
  }

  return (
    <div className="drive-workspace">
      {errorMessage && (
        <Alert>
          <AlertTitle>No se pudo completar la acción</AlertTitle>
          <AlertDescription>Tu trabajo local se conserva.</AlertDescription>
          {unknownWrite && (
            <AlertDescription>Actualiza la lista antes de volver a guardar.</AlertDescription>
          )}
        </Alert>
      )}
      {connectionContent}
      {!isMobile && documentView}
      {isMobile && (
        <Sheet
          open={doc !== null}
          onOpenChange={(open) => {
            if (!open) closeDoc();
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Documento</SheetTitle>
            </SheetHeader>
            {documentView}
          </SheetContent>
        </Sheet>
      )}
      {conflictOpen && (
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
      )}
      <AlertDialog
        open={recreateDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRecreateDialog(null);
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
}
