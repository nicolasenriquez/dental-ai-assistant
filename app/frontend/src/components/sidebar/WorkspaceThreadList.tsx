import { History, MessageCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useMemo, useState } from 'react';
import { SIDEBAR_MOTION } from './sidebarMotion';

export interface WorkspaceThreadItem {
  id: string;
  title: string;
  updatedAt: string;
  active?: boolean;
  statusLabel?: string;
}

interface WorkspaceThreadListProps {
  ariaLabel: string;
  title: string;
  items: WorkspaceThreadItem[];
  isCollapsed?: boolean;
  loading?: boolean;
  error?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  creating?: boolean;
  onRetry?: () => void;
  onRequestExpand?: () => void;
  emptyMessage?: string;
  emptyActionLabel?: string;
  createLabel?: string;
  showHeaderCreate?: boolean;
  showCompactCreate?: boolean;
  renderItem?: (item: WorkspaceThreadItem) => ReactNode;
}

type ThreadGroup = 'Hoy' | 'Ayer' | 'Anteriores';

const GROUP_ORDER: ThreadGroup[] = ['Hoy', 'Ayer', 'Anteriores'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getGroup(updatedAt: string): ThreadGroup {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 'Anteriores';
  const daysAgo = Math.floor((startOfDay(new Date()) - startOfDay(updated)) / 86_400_000);
  if (daysAgo <= 0) return 'Hoy';
  if (daysAgo === 1) return 'Ayer';
  return 'Anteriores';
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

export function WorkspaceThreadList({
  ariaLabel,
  title,
  items,
  isCollapsed = false,
  loading = false,
  error = false,
  query = '',
  onQueryChange,
  onCreate,
  onSelect,
  creating = false,
  onRetry,
  emptyMessage = 'Aún no hay hilos',
  emptyActionLabel = 'Nuevo hilo',
  createLabel = 'Nuevo hilo',
  showHeaderCreate = true,
  showCompactCreate = true,
  onRequestExpand,
  renderItem,
}: WorkspaceThreadListProps) {
  const [expanded, setExpanded] = useState<Record<ThreadGroup, boolean>>({
    Hoy: true,
    Ayer: true,
    Anteriores: true,
  });
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) => item.title.toLocaleLowerCase().includes(normalized));
  }, [items, query]);
  const grouped = useMemo(() => {
    const groups = new Map<ThreadGroup, WorkspaceThreadItem[]>();
    for (const item of filteredItems) {
      const group = getGroup(item.updatedAt);
      groups.set(group, [...(groups.get(group) ?? []), item]);
    }
    return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
      group,
      items: groups.get(group) ?? [],
    }));
  }, [filteredItems]);
  const hasPending = items.some((item) => item.statusLabel);
  const historyLabel = hasPending
    ? `Abrir historial de ${title.toLocaleLowerCase()}; hay una aprobación pendiente`
    : `Abrir historial de ${title.toLocaleLowerCase()}`;

  return (
    <section
      className={`workspace-thread-list${isCollapsed ? ' is-collapsed' : ''}`}
      aria-label={ariaLabel}
    >
      {!isCollapsed && (
        <div className="workspace-thread-list__heading">
          <span>{title}</span>
          {showHeaderCreate && (
            <button type="button" onClick={onCreate} disabled={creating} aria-label={createLabel}>
              ＋
            </button>
          )}
        </div>
      )}
      {isCollapsed && showCompactCreate && (
        <button
          type="button"
          className="workspace-thread-list__compact-create"
          onClick={onCreate}
          disabled={creating}
          aria-label={createLabel}
          title={createLabel}
        >
          ＋
        </button>
      )}
      {isCollapsed && onRequestExpand && (
        <button
          type="button"
          className="workspace-thread-list__history"
          onClick={onRequestExpand}
          aria-label={historyLabel}
          title={historyLabel}
        >
          <History aria-hidden="true" size={17} strokeWidth={1.7} />
          {hasPending && <span className="workspace-thread-list__pending-dot" aria-hidden="true" />}
        </button>
      )}
      {onQueryChange && !isCollapsed && (
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar hilos"
          aria-label={`Buscar en ${title.toLocaleLowerCase()}`}
          className="workspace-thread-list__search"
        />
      )}
      {loading && <p className="workspace-thread-list__state">Cargando…</p>}
      {!loading && error && (
        <div className="workspace-thread-list__state" role="alert">
          <span>No pudimos cargar los hilos.</span>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Reintentar
            </button>
          )}
        </div>
      )}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="workspace-thread-list__state">
          <span>{query.trim() ? 'Sin resultados' : emptyMessage}</span>
          {!query.trim() && (
            <button type="button" onClick={onCreate} disabled={creating}>
              {emptyActionLabel}
            </button>
          )}
        </div>
      )}
      {!isCollapsed &&
        !loading &&
        !error &&
        grouped.map(({ group, items: groupItems }) => (
          <section key={group} className="workspace-thread-list__group" aria-label={group}>
            {!isCollapsed && (
              <button
                type="button"
                className="workspace-thread-list__group-heading"
                onClick={() => setExpanded((current) => ({ ...current, [group]: !current[group] }))}
                aria-expanded={expanded[group]}
              >
                <span>{group}</span>
                <span>{groupItems.length}</span>
              </button>
            )}
            <AnimatePresence initial={false}>
              {expanded[group] && (
                <motion.div
                  className="workspace-thread-list__group-items"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: SIDEBAR_MOTION.normal, ease: SIDEBAR_MOTION.ease }}
                >
                  {groupItems.map((item) =>
                    renderItem ? (
                      <div key={item.id} className="workspace-thread-list__custom-item">
                        {renderItem(item)}
                      </div>
                    ) : (
                      <button
                        type="button"
                        key={item.id}
                        className={`workspace-thread-list__item${item.active ? ' is-active' : ''}`}
                        onClick={() => onSelect(item.id)}
                        aria-current={item.active ? 'page' : undefined}
                        aria-label={
                          item.statusLabel
                            ? `${item.title} · ${item.statusLabel === '!' ? 'Aprobación pendiente' : item.statusLabel}`
                            : item.title
                        }
                        title={item.title}
                      >
                        <MessageCircle
                          className="workspace-thread-list__item-icon"
                          aria-hidden="true"
                          size={16}
                          strokeWidth={1.7}
                        />
                        <span className="workspace-thread-list__copy">
                          <strong>{item.title}</strong>
                          <small>{formatUpdatedAt(item.updatedAt)}</small>
                        </span>
                        {item.statusLabel && (
                          <span className="workspace-thread-list__status">{item.statusLabel}</span>
                        )}
                      </button>
                    ),
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        ))}
    </section>
  );
}
