import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClinicalPendingWork } from '../../hooks/useClinicalPendingWork';
import {
  ApiError,
  type ClinicalExpectedIdentity,
  type PendingWorkItem,
  discardClinicalArtifact,
  getClinicalThread,
  resolveClinicalAction,
  retryClinicalDriveExport,
} from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '../ui/alert-dialog';

type PendingRestore = {
  trigger: HTMLButtonElement;
  row: HTMLElement;
  rowIndex: number;
  anchorTop: number;
  scroller: HTMLElement | null;
};

// The client-asserted intent stays fixed across an uncertain retry so the
// server receipt binds to one operation instead of a replacement UUID.
type DismissIntent =
  | {
      kind: 'decline';
      itemId: string;
      patientLabel: string;
      threadId: string;
      actionId: string;
      proposalHash: string;
      expected: ClinicalExpectedIdentity;
      trigger: HTMLButtonElement;
    }
  | {
      kind: 'discard';
      itemId: string;
      patientLabel: string;
      threadId: string;
      artifactId: string;
      operationId: string;
      expectedPatientId: string;
      expectedUpdatedAt: string;
      trigger: HTMLButtonElement;
    };

const workLabel = (kind: DismissIntent['kind']): string =>
  kind === 'decline' ? 'Evolución lista para revisión' : 'Borrador por continuar';

function scrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    if (current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return null;
}

function captureRestore(
  trigger: HTMLButtonElement,
  root: HTMLElement | null,
): PendingRestore | null {
  const row = trigger.closest('article');
  if (!row) return null;
  const rows = root ? Array.from(root.querySelectorAll('article')) : [];
  return {
    trigger,
    row,
    rowIndex: rows.indexOf(row),
    anchorTop: row.getBoundingClientRect().top,
    scroller: scrollableAncestor(row),
  };
}

function isUncertain(cause: unknown): boolean {
  return !(cause instanceof ApiError) || cause.status >= 500;
}

function conflictMessage(cause: unknown): string {
  const body = cause instanceof ApiError ? (cause.body as { detail?: unknown } | null) : null;
  const detail = body?.detail;
  const code =
    typeof detail === 'object' && detail !== null && 'code' in detail
      ? String((detail as { code?: unknown }).code)
      : null;
  if (code === 'CLINICAL_DISCARD_STALE' || code === 'PROPOSAL_STALE') {
    return 'El trabajo cambió desde que lo leíste. Revisa el contenido actual antes de descartarlo.';
  }
  if (code === 'CLINICAL_DISMISSAL_BUSY') {
    return 'Otro cambio está en curso. Intenta de nuevo en un momento.';
  }
  if (code === 'ACTION_EXPIRED') {
    return 'La revisión expiró y ya no se puede descartar desde aquí.';
  }
  if (cause instanceof ApiError && cause.status === 404) {
    return 'El trabajo ya no está disponible.';
  }
  return 'No se pudo descartar el trabajo. Actualiza la lista para revisar el estado actual.';
}

export function ClinicalPendingWork({
  patientId,
  kind,
  onClose,
  onDismissed,
}: {
  patientId?: string;
  kind?: PendingWorkItem['kind'];
  onClose?: () => void;
  onDismissed?: () => void;
}): JSX.Element {
  const { page, loading, error, refresh, loadMore } = useClinicalPendingWork(patientId, kind);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [intent, setIntent] = useState<DismissIntent | null>(null);
  const [uncertain, setUncertain] = useState<DismissIntent | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState<{ itemId: string; message: string } | null>(
    null,
  );
  const rootRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<PendingRestore | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const scopeRef = useRef('');
  scopeRef.current = `${patientId ?? ''}|${kind ?? ''}`;

  const retry = async (id: string, trigger: HTMLButtonElement): Promise<void> => {
    setRetrying(id);
    setRetryError(false);
    restoreRef.current = captureRestore(trigger, rootRef.current);
    let exportFailed = false;
    try {
      await retryClinicalDriveExport(id);
    } catch {
      exportFailed = true;
    }
    await refresh();
    setRetryError(exportFailed);
    setRetrying(null);
  };
  useLayoutEffect(() => {
    if (retrying !== null || dismissing) return;
    const pending = restoreRef.current;
    if (!pending) return;
    restoreRef.current = null;
    const rowSurvived = pending.row.isConnected;
    const actionSurvived = pending.trigger.isConnected;
    if (rowSurvived && pending.scroller?.isConnected) {
      const delta = pending.row.getBoundingClientRect().top - pending.anchorTop;
      if (delta) pending.scroller.scrollTop += delta;
    }
    if (!rowSurvived || !actionSurvived) setAnnouncement('Se actualizó el trabajo pendiente.');
    if (rowSurvived) {
      if (!actionSurvived) pending.row.querySelector<HTMLElement>('a, button')?.focus();
      else if (!document.activeElement || document.activeElement === document.body) {
        pending.trigger.focus();
      }
      return;
    }
    const rows = rootRef.current ? Array.from(rootRef.current.querySelectorAll('article')) : [];
    const target = rows[Math.max(0, Math.min(pending.rowIndex, rows.length - 1))];
    (target?.querySelector<HTMLElement>('a, button') ?? rootRef.current)?.focus();
  }, [page, retrying, dismissing]);

  const canonicalIntent = async (
    item: PendingWorkItem,
    trigger: HTMLButtonElement,
  ): Promise<DismissIntent | null> => {
    const threadId = item.action.thread_id;
    if (!threadId) return null;
    const thread = await getClinicalThread(threadId, { readOnly: true });
    const pendingAction = item.action;
    if (item.kind === 'approval_required' && pendingAction.kind === 'review_approval') {
      const action = thread.actions?.find((candidate) => candidate.id === pendingAction.action_id);
      const artifact = action?.artifact_id
        ? thread.artifacts.find((candidate) => candidate.id === action.artifact_id)
        : undefined;
      if (
        !action ||
        action.status !== 'pending' ||
        action.patient_id !== item.patient.id ||
        !artifact ||
        artifact.status !== 'pending' ||
        artifact.patient_id !== item.patient.id
      ) {
        return null;
      }
      return {
        kind: 'decline',
        itemId: item.id,
        patientLabel: item.patient.display_name,
        threadId,
        actionId: action.id,
        proposalHash: action.proposal_hash,
        expected: {
          expected_patient_id: item.patient.id,
          expected_thread_id: threadId,
          expected_artifact_id: artifact.id,
          expected_artifact_updated_at: artifact.updated_at,
        },
        trigger,
      };
    }
    if (item.kind === 'recoverable_draft' && pendingAction.kind === 'continue_draft') {
      const artifact = thread.artifacts.find(
        (candidate) => candidate.id === pendingAction.artifact_id,
      );
      if (
        !artifact ||
        (artifact.status !== 'draft' && artifact.status !== 'stale') ||
        artifact.patient_id !== item.patient.id
      ) {
        return null;
      }
      return {
        kind: 'discard',
        itemId: item.id,
        patientLabel: item.patient.display_name,
        threadId,
        artifactId: artifact.id,
        operationId: crypto.randomUUID(),
        expectedPatientId: artifact.patient_id,
        expectedUpdatedAt: artifact.updated_at,
        trigger,
      };
    }
    return null;
  };

  const execute = async (pending: DismissIntent): Promise<void> => {
    if (pending.kind === 'decline') {
      await resolveClinicalAction(
        pending.actionId,
        'decline',
        pending.proposalHash,
        pending.expected,
      );
      return;
    }
    await discardClinicalArtifact(pending.threadId, pending.artifactId, {
      operation_id: pending.operationId,
      expected_patient_id: pending.expectedPatientId,
      expected_artifact_updated_at: pending.expectedUpdatedAt,
    });
  };

  const runDismiss = async (pending: DismissIntent): Promise<void> => {
    const scope = scopeRef.current;
    setDismissing(true);
    setDismissError(null);
    restoreRef.current = captureRestore(pending.trigger, rootRef.current);
    try {
      await execute(pending);
      if (scopeRef.current !== scope) return;
      setIntent(null);
      setUncertain(null);
      await refresh();
      onDismissed?.();
    } catch (caught) {
      if (scopeRef.current !== scope) return;
      setIntent(null);
      if (isUncertain(caught)) {
        setUncertain(pending);
        const row = pending.trigger.closest('article');
        window.requestAnimationFrame(() => row?.querySelector<HTMLElement>('button')?.focus());
      } else {
        setDismissError({ itemId: pending.itemId, message: conflictMessage(caught) });
      }
    } finally {
      if (scopeRef.current === scope) setDismissing(false);
    }
  };

  const openDismiss = async (item: PendingWorkItem, trigger: HTMLButtonElement): Promise<void> => {
    const scope = scopeRef.current;
    lastTriggerRef.current = trigger;
    setDismissError(null);
    setReading(item.id);
    let next: DismissIntent | null = null;
    try {
      next = await canonicalIntent(item, trigger);
    } catch {
      next = null;
    }
    if (scopeRef.current !== scope) return;
    setReading(null);
    if (!next) {
      setDismissError({
        itemId: item.id,
        message:
          'El trabajo cambió o ya no está disponible. Actualiza la lista para ver el estado.',
      });
      return;
    }
    setIntent(next);
  };

  // Read-only receipt/state reconciliation. Never mints a new operation and
  // never treats absence alone as success.
  const reconcile = async (
    pending: DismissIntent,
    retryIfEligible: boolean,
    trigger: HTMLButtonElement,
  ): Promise<void> => {
    const scope = scopeRef.current;
    setDismissing(true);
    setDismissError(null);
    restoreRef.current = captureRestore(trigger, rootRef.current);
    try {
      const thread = await getClinicalThread(pending.threadId, { readOnly: true });
      if (scopeRef.current !== scope) return;
      if (pending.kind === 'decline') {
        const action = thread.actions?.find((candidate) => candidate.id === pending.actionId);
        if (action?.status === 'declined' && action.proposal_hash === pending.proposalHash) {
          setUncertain(null);
          await refresh();
          onDismissed?.();
          return;
        }
        if (action?.status === 'approved') {
          setUncertain(null);
          setDismissError({
            itemId: pending.itemId,
            message: 'Otra persona aprobó esta evolución; se guardó en ficha y no se descartó.',
          });
          await refresh();
          onDismissed?.();
          return;
        }
        if (retryIfEligible && action?.status === 'pending') {
          await execute(pending);
          setUncertain(null);
          await refresh();
          onDismissed?.();
          return;
        }
        setDismissError({
          itemId: pending.itemId,
          message: action
            ? 'La evolución sigue pendiente de revisión.'
            : 'El trabajo ya no está disponible.',
        });
        return;
      }
      const artifact = thread.artifacts.find((candidate) => candidate.id === pending.artifactId);
      if (
        artifact?.status === 'discarded' &&
        artifact.discard_operation_id === pending.operationId
      ) {
        setUncertain(null);
        await refresh();
        onDismissed?.();
        return;
      }
      if (retryIfEligible && (artifact?.status === 'draft' || artifact?.status === 'stale')) {
        await execute(pending);
        setUncertain(null);
        await refresh();
        onDismissed?.();
        return;
      }
      setDismissError({
        itemId: pending.itemId,
        message: artifact ? 'El borrador sigue pendiente.' : 'El trabajo ya no está disponible.',
      });
    } catch (caught) {
      if (scopeRef.current !== scope) return;
      if (isUncertain(caught)) {
        setDismissError({
          itemId: pending.itemId,
          message: 'No pudimos confirmar el estado. El trabajo sigue en la lista.',
        });
      } else {
        // A definitive conflict closes the uncertain intent: the clinician must
        // review the current resource before starting a new one.
        setUncertain(null);
        setDismissError({ itemId: pending.itemId, message: conflictMessage(caught) });
      }
    } finally {
      if (scopeRef.current === scope) setDismissing(false);
    }
  };

  return (
    <section ref={rootRef} tabIndex={-1} aria-label="Trabajo pendiente" className="space-y-4 p-3">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {onClose && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {page ? `${page.total} ${page.total === 1 ? 'pendiente' : 'pendientes'}` : 'Cargando…'}
          </p>
          <Button variant="clinicalSecondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      )}
      {loading && !page && (
        <div role="status">
          <span className="sr-only">Cargando pendientes</span>
          <div className="skeleton h-20 w-full" />
        </div>
      )}
      {error && (
        <div role="alert">
          <p>No pudimos cargar tus pendientes.</p>
          <Button variant="clinicalSecondary" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      )}
      {retryError && (
        <p role="alert" className="text-error">
          No pudimos reintentar la sincronización. La evolución sigue guardada en ficha.
        </p>
      )}
      {dismissError && (
        <p role="alert" className="text-error">
          {dismissError.message}
        </p>
      )}
      {!loading && !error && page?.items.length === 0 && (
        <p className="text-sm text-muted">No hay trabajo pendiente</p>
      )}
      {(['clinical', 'drive'] as const).map((group) => {
        const items = page?.items.filter((item) =>
          group === 'drive'
            ? item.kind === 'drive_export_failed'
            : item.kind !== 'drive_export_failed',
        );
        if (!items?.length) return null;
        return (
          <section
            key={group}
            aria-label={group === 'drive' ? 'Sincronización de Drive' : 'Borradores y revisión'}
          >
            <h2 className="text-sm font-semibold text-foreground">
              {group === 'drive' ? 'Sincronización de Drive' : 'Borradores y revisión'}
            </h2>
            {items.map((item) => (
              <article key={item.id} className="space-y-2 border-b border-border py-3 text-sm">
                <h3 className="font-medium">{item.patient.display_name}</h3>
                <p className="text-muted">{item.patient.rut_masked}</p>
                {item.summary && <p>{item.summary}</p>}
                <p>
                  {item.kind === 'approval_required'
                    ? 'Evolución lista para revisión'
                    : item.kind === 'recoverable_draft'
                      ? 'Borrador por continuar'
                      : 'Guardada en ficha · No se pudo sincronizar con Drive'}
                </p>
                <time className="block text-xs text-muted" dateTime={item.updated_at}>
                  Actualizado {formatClinicalDateShort(item.updated_at)} ·{' '}
                  {formatClinicalTime(item.updated_at)}
                </time>
                {item.action.kind === 'retry_drive_export' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      className="inline-block py-2 text-primary hover:underline"
                      to={`/patients/${item.patient.id}/evolutions/${item.action.evolution_id}`}
                    >
                      Ver evolución
                    </Link>
                    <Button
                      variant="clinicalSecondary"
                      disabled={retrying !== null}
                      onClick={(event) => {
                        if (item.action.kind === 'retry_drive_export') {
                          void retry(item.action.evolution_id, event.currentTarget);
                        }
                      }}
                    >
                      {retrying === item.action.evolution_id ? 'Reintentando…' : 'Reintentar'}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      className="inline-block py-2 text-primary hover:underline"
                      to={
                        item.action.kind === 'continue_draft'
                          ? `/a/${item.action.thread_id}#artifact=${encodeURIComponent(item.action.artifact_id)}`
                          : `/a/${item.action.thread_id}#approval=${encodeURIComponent(item.action.action_id)}`
                      }
                    >
                      {item.kind === 'approval_required' ? 'Revisar' : 'Continuar'}
                    </Link>
                    {uncertain?.itemId === item.id ? (
                      <>
                        <Button
                          variant="clinicalSecondary"
                          disabled={dismissing}
                          onClick={(event) => void reconcile(uncertain, false, event.currentTarget)}
                        >
                          Verificar estado
                        </Button>
                        <Button
                          variant="clinicalSecondary"
                          disabled={dismissing}
                          onClick={(event) => void reconcile(uncertain, true, event.currentTarget)}
                        >
                          Reintentar
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="clinicalSecondary"
                        disabled={dismissing || reading !== null}
                        onClick={(event) => void openDismiss(item, event.currentTarget)}
                      >
                        {reading === item.id ? 'Revisando…' : 'Descartar'}
                      </Button>
                    )}
                  </div>
                )}
                {uncertain?.itemId === item.id && (
                  <p role="status" className="text-muted">
                    No pudimos confirmar si el descarte se completó.
                  </p>
                )}
              </article>
            ))}
          </section>
        );
      })}
      {page?.next_cursor && (
        <Button variant="clinicalSecondary" disabled={loading} onClick={() => void loadMore()}>
          {loading ? 'Cargando…' : 'Ver más pendientes'}
        </Button>
      )}
      <AlertDialog
        open={intent !== null}
        onOpenChange={(open) => {
          if (!open && !dismissing) setIntent(null);
        }}
      >
        <AlertDialogContent
          role="alertdialog"
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
            if (dismissing) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = lastTriggerRef.current;
            if (trigger?.isConnected) trigger.focus();
          }}
        >
          <AlertDialogTitle>Descartar trabajo pendiente</AlertDialogTitle>
          <AlertDialogDescription>
            {intent
              ? `${intent.patientLabel} · ${workLabel(intent.kind)}. Dejará de estar disponible para revisión o continuación. Las evoluciones guardadas en ficha y los documentos originales en Drive no se modifican.`
              : ''}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissing}>Mantener</AlertDialogCancel>
            <Button
              type="button"
              variant="clinical"
              disabled={dismissing}
              onClick={() => {
                if (intent) void runDismiss(intent);
              }}
            >
              {dismissing ? 'Descartando…' : 'Descartar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
