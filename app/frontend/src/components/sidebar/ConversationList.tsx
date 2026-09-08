import {
  ChevronRight,
  CircleAlert,
  Ellipsis,
  MessageCircle,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  ConversationRuntime,
  RuntimeByConversationId,
} from '../../hooks/useStreamingResponse';
import type { Conversation } from '../../lib/api';
import { SIDEBAR_MOTION } from './sidebarMotion';

type ConversationGroup = 'Hoy' | 'Ayer' | 'Anteriores';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  query: string;
  activeConversationId?: string;
  runtimeByConversationId?: RuntimeByConversationId;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

interface GroupedConversations {
  group: ConversationGroup;
  items: Conversation[];
}

export interface ConversationRowProps {
  conversation: Conversation;
  query: string;
  isActive: boolean;
  runtime?: ConversationRuntime;
  onSelect: () => void;
  onDeleteRequest: () => void;
  onRename: (title: string) => void;
}

interface MenuPosition {
  top: number;
  right: number;
}

const GROUP_ORDER: ConversationGroup[] = ['Hoy', 'Ayer', 'Anteriores'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getConversationGroup(updatedAt: string, now = new Date()): ConversationGroup {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 'Anteriores';

  const daysAgo = Math.floor((startOfDay(now) - startOfDay(updated)) / 86_400_000);
  if (daysAgo <= 0) return 'Hoy';
  if (daysAgo === 1) return 'Ayer';
  return 'Anteriores';
}

function groupConversations(conversations: Conversation[]): GroupedConversations[] {
  const groups = new Map<ConversationGroup, Conversation[]>();

  for (const conversation of conversations) {
    const group = getConversationGroup(conversation.updated_at);
    const items = groups.get(group) ?? [];
    items.push(conversation);
    groups.set(group, items);
  }

  return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
    group,
    items: groups.get(group) ?? [],
  }));
}

function highlightMatch(title: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return title;
  const index = title.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) return title;

  return (
    <>
      {title.slice(0, index)}
      <mark className="conversation-match">{title.slice(index, index + trimmed.length)}</mark>
      {title.slice(index + trimmed.length)}
    </>
  );
}

export function ConversationRow({
  conversation,
  query,
  isActive,
  runtime,
  onSelect,
  onDeleteRequest,
  onRename,
}: ConversationRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuLayerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const menuItems = Array.from(
        menuLayerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (menuItems.length === 0) return;

      event.preventDefault();
      const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length;
      menuItems[nextIndex].focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      const menu = menuLayerRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const opensUpward = triggerRect.bottom + menuRect.height > window.innerHeight - 8;

      setMenuPosition({
        top: opensUpward ? triggerRect.top - menuRect.height + 2 : triggerRect.bottom - 2,
        right: Math.max(8, window.innerWidth - triggerRect.right + 4),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && menuPosition) {
      menuLayerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [menuOpen, menuPosition]);

  const commitRename = () => {
    const title = editValue.trim();
    if (title && title !== conversation.title) onRename(title);
    setEditing(false);
  };

  const startRename = () => {
    setMenuOpen(false);
    setEditValue(conversation.title);
    setEditing(true);
  };

  return (
    <div className={`conversation-item${isActive ? ' is-active' : ''}`} ref={menuRef}>
      {editing ? (
        <input
          ref={inputRef}
          className="conversation-edit-input"
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') {
              setEditValue(conversation.title);
              setEditing(false);
            }
          }}
          onBlur={commitRename}
          aria-label="Renombrar conversación"
        />
      ) : (
        <button
          type="button"
          className="conversation-title"
          onClick={onSelect}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename();
          }}
          aria-label={conversation.title}
          aria-current={isActive ? 'page' : undefined}
          aria-busy={runtime?.status === 'running'}
          title={
            runtime?.status === 'running'
              ? `${conversation.title} · Respuesta en progreso`
              : runtime?.status === 'error'
                ? `${conversation.title} · Error en la respuesta`
                : conversation.title
          }
        >
          <span className="conversation-title-icon" aria-hidden="true">
            <MessageCircle size={16} strokeWidth={1.7} />
          </span>
          <span className="conversation-title-label">
            {highlightMatch(conversation.title, query)}
          </span>
          {runtime?.status === 'running' && (
            <span
              className="conversation-progress-indicator"
              role="status"
              aria-label="Respuesta en progreso"
              title="Respuesta en progreso"
            />
          )}
          {runtime?.status === 'error' && (
            <CircleAlert
              className="conversation-error-indicator"
              aria-label="Error en la respuesta"
              role="img"
              size={15}
              strokeWidth={1.8}
            />
          )}
        </button>
      )}

      {!editing && (
        <button
          type="button"
          className="conversation-menu-trigger conversation-action"
          ref={triggerRef}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
          aria-label={`Acciones para ${conversation.title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="Acciones de conversación"
        >
          <Ellipsis aria-hidden="true" size={16} strokeWidth={1.7} />
        </button>
      )}

      {createPortal(
        <AnimatePresence>
          {menuOpen && !editing && (
            <motion.div
              ref={menuLayerRef}
              className="conversation-menu"
              role="menu"
              style={
                menuPosition
                  ? { top: `${menuPosition.top}px`, right: `${menuPosition.right}px` }
                  : { visibility: 'hidden' }
              }
              initial={{ opacity: 0, y: -3, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -3, scale: 0.98 }}
              transition={{ duration: SIDEBAR_MOTION.fast, ease: SIDEBAR_MOTION.ease }}
            >
              <button
                type="button"
                className="sidebar-menu-item"
                role="menuitem"
                onClick={startRename}
              >
                <Pencil aria-hidden="true" size={16} strokeWidth={1.7} />
                Renombrar
              </button>
              <button
                type="button"
                className="sidebar-menu-item sidebar-menu-item--danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteRequest();
                }}
              >
                <Trash2 aria-hidden="true" size={16} strokeWidth={1.7} />
                Eliminar
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="conversation-skeletons" aria-label="Cargando conversaciones">
      {[1, 2, 3, 4].map((item) => (
        <div className="conversation-skeleton" key={item} />
      ))}
    </div>
  );
}

export function ConversationList({
  conversations,
  loading,
  query,
  activeConversationId,
  runtimeByConversationId,
  onNewChat,
  onSelect,
  onDeleteRequest,
  onRename,
}: ConversationListProps) {
  if (loading) return <SkeletonRows />;

  if (conversations.length === 0) {
    return (
      <div className="conversation-empty" role="status">
        <Search aria-hidden="true" size={24} strokeWidth={1.5} />
        {query.trim() ? (
          <p>
            Sin resultados para <strong>“{query.trim()}”</strong>
          </p>
        ) : (
          <>
            <p>Aún no hay conversaciones</p>
            <button type="button" className="sidebar-empty-action" onClick={onNewChat}>
              Inicia tu primer chat
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="conversation-list" aria-label="Conversaciones">
      {groupConversations(conversations).map(({ group, items }) => (
        <ConversationGroup
          key={group}
          group={group}
          items={items}
          query={query}
          activeConversationId={activeConversationId}
          runtimeByConversationId={runtimeByConversationId}
          onSelect={onSelect}
          onDeleteRequest={onDeleteRequest}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

interface ConversationGroupProps {
  group: ConversationGroup;
  items: Conversation[];
  query: string;
  activeConversationId?: string;
  runtimeByConversationId?: RuntimeByConversationId;
  onSelect: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function ConversationGroup({
  group,
  items,
  query,
  activeConversationId,
  runtimeByConversationId,
  onSelect,
  onDeleteRequest,
  onRename,
}: ConversationGroupProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="conversation-group" aria-label={group}>
      <button
        type="button"
        className="conversation-group-header"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <ChevronRight
          aria-hidden="true"
          size={14}
          strokeWidth={1.7}
          className={
            expanded ? 'conversation-group-chevron is-expanded' : 'conversation-group-chevron'
          }
        />
        <span>{group}</span>
        <span className="conversation-group-count">{items.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: SIDEBAR_MOTION.normal, ease: SIDEBAR_MOTION.ease }}
            className="conversation-group-items"
          >
            {items.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                query={query}
                isActive={conversation.id === activeConversationId}
                runtime={runtimeByConversationId?.[conversation.id]}
                onSelect={() => onSelect(conversation.id)}
                onDeleteRequest={() => onDeleteRequest(conversation.id)}
                onRename={(title) => onRename(conversation.id, title)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

interface ConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
  error: boolean;
}

export function ConfirmDialog({ onConfirm, onCancel, deleting, error }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = 'delete-conversation-title';

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="sidebar-dialog-overlay" role="presentation">
      <div className="sidebar-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>¿Eliminar conversación?</h2>
        <p>Esta acción no se puede deshacer.</p>
        {error && (
          <p className="sidebar-dialog-error" role="alert">
            No pudimos eliminarla. Intenta nuevamente.
          </p>
        )}
        <div className="sidebar-dialog-actions">
          <button
            type="button"
            ref={cancelRef}
            className="sidebar-dialog-cancel"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="sidebar-dialog-confirm"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
