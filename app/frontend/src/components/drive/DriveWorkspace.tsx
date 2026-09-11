import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  type DriveFile,
  type DriveStatus,
  createDriveFile,
  getDriveFile,
  getDriveStatus,
  listDriveFiles,
  recreateDriveWorkspace,
  searchDriveFiles,
  startDriveOAuth,
  updateDriveFile,
} from '../../lib/api';
import { normalizeDriveFileName, serializeToPlainText } from '../../lib/driveDocument';
import type { AuthoringRepresentation } from '../../lib/driveDocument';
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
  name: string;
  version: string | null;
  content: string;
  baseline: string | null;
  representation: AuthoringRepresentation;
}

interface DriveWorkspaceProps {
  patientId: string | null;
  draftSeed?: { name: string; content: string } | null;
}

function newOperationId(): string {
  return crypto.randomUUID();
}

export function DriveWorkspace({ patientId, draftSeed = null }: DriveWorkspaceProps) {
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
  const [conflictOpen, setConflictOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recreateDialog, setRecreateDialog] = useState<'missing' | 'recovery' | null>(null);
  const isMobile = useMemo(() => window.matchMedia?.('(max-width: 767px)')?.matches ?? false, []);

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
  }, [patientId]);

  useEffect(() => {
    if (!draftSeed) return;
    setDoc({
      fileId: null,
      name: normalizeDriveFileName(draftSeed.name),
      version: null,
      content: draftSeed.content,
      baseline: null,
      representation: 'local_markdown',
    });
    setMode('editing');
    setDocPhase('ready');
    setSaved(false);
  }, [draftSeed]);

  useEffect(() => {
    if (!patientId || driveStatus?.status !== 'connected') return;
    let cancelled = false;
    setListLoading(true);
    setFiles([]);
    setNextPageToken(null);
    listDriveFiles(patientId, undefined)
      .then((page) => {
        if (cancelled) return;
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
    setDoc({
      fileId: file.id,
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
        prev && prev.fileId === file.id
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
    setDoc(null);
    setMode('viewing');
    setSaved(false);
    setConflictOpen(false);
  };

  const handleSave = async () => {
    if (!doc || !patientId) return;
    const exportContent = serializeToPlainText(doc.content, doc.representation);
    const operationId = newOperationId();
    setSaving(true);
    setSaved(false);
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
            ? { ...prev, fileId: created.id, version: created.version, baseline: exportContent }
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
            ? { ...prev, version: updated.version, baseline: exportContent }
            : prev,
        );
      }
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictOpen(true);
      } else {
        setErrorMessage('No se pudo completar la acción');
      }
    } finally {
      setSaving(false);
    }
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
                <button type="button" className="drive-btn drive-btn-secondary">
                  Importar una copia
                </button>
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
