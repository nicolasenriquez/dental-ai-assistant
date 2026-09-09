import { motion } from 'motion/react';
import {
  type KeyboardEventHandler,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import type { RuntimeByConversationId } from '../hooks/useStreamingResponse';
import { useToast } from '../hooks/useToast';
import { createConversation, deleteConversation } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { VideoExplorer } from './VideoExplorer';
import { ChatThreadList } from './sidebar/ChatThreadList';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarNavigation } from './sidebar/SidebarNavigation';
import { SidebarSearch } from './sidebar/SidebarSearch';
import { SidebarUserMenu } from './sidebar/SidebarUserMenu';
import { SIDEBAR_MOTION } from './sidebar/sidebarMotion';

interface DailyQuotaCounterProps {
  isCollapsed: boolean;
  used: number;
  remaining: number;
  resetsAt: string | null;
}

function DailyQuotaCounter({ isCollapsed, used, remaining, resetsAt }: DailyQuotaCounterProps) {
  const cap = Math.max(used + remaining, 0);
  const atLimit = remaining === 0;
  const percent = cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0;
  const resetLabel = resetsAt
    ? new Date(resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="quota-counter"
      className={`sidebar-quota${atLimit ? ' is-at-limit' : ''}`}
      title={`${used} de ${cap} mensajes usados hoy`}
    >
      <div className="sidebar-quota-heading">
        <span className="sidebar-label">
          <strong>{used}</strong> / {cap} mensajes hoy
        </span>
        {atLimit && resetLabel && (
          <span className="sidebar-quota-reset sidebar-label">{resetLabel}</span>
        )}
      </div>
      <div
        className="sidebar-quota-track"
        role="progressbar"
        tabIndex={0}
        aria-label="Cuota de mensajes diaria"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.min(used, cap)}
      >
        <motion.div
          className="sidebar-quota-fill"
          animate={{ width: `${percent}%` }}
          transition={{ duration: SIDEBAR_MOTION.slow, ease: SIDEBAR_MOTION.ease }}
        />
      </div>
      {isCollapsed && (
        <span className="sidebar-visually-hidden">
          {used} de {cap} mensajes
        </span>
      )}
    </div>
  );
}

export interface SidebarProps {
  activeConversationId?: string;
  isOpen: boolean;
  onClose: () => void;
  conversationsRef?: MutableRefObject<(() => Promise<void>) | null>;
  showConversations?: boolean;
  isMobile?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  runtimeByConversationId?: RuntimeByConversationId;
  sidebarRef?: RefObject<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  secondaryContent?: ReactNode;
}

export function Sidebar({
  activeConversationId,
  isOpen,
  onClose,
  conversationsRef,
  showConversations = true,
  isMobile = false,
  isCollapsed = false,
  onToggleCollapse = () => undefined,
  runtimeByConversationId,
  sidebarRef,
  onKeyDown,
  secondaryContent,
}: SidebarProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { conversations, loading, error, refetch, rename, filteredConversations } =
    useConversations(debouncedQuery, showConversations);
  const { user, logout } = useAuth();
  const [creatingNew, setCreatingNew] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (conversationsRef) conversationsRef.current = refetch;
  }, [refetch, conversationsRef]);

  const handleNewChat = async () => {
    if (activeConversationId) {
      const activeConversation = conversations.find(
        (conversation) => conversation.id === activeConversationId,
      );
      if (activeConversation && !activeConversation.preview) {
        onClose();
        return;
      }
    }

    setCreatingNew(true);
    setNewChatError(null);
    try {
      const conversation = await createConversation();
      await refetch();
      navigate(`/c/${conversation.id}`);
      onClose();
    } catch {
      setNewChatError('No pudimos crear la conversación. Intenta nuevamente.');
    } finally {
      setCreatingNew(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setConfirmId(id);
    setDeleteError(false);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmId) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      const response = await deleteConversation(confirmId);
      if (!response.ok && response.status !== 204) throw new Error('Delete failed');
      setConfirmId(null);
      await refetch();
      if (activeConversationId === confirmId) navigate('/chat');
    } catch (deleteFailure) {
      console.error('[Sidebar] Delete conversation failed:', deleteFailure);
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async (id: string, title: string) => {
    const result = await rename(id, title);
    if (!result.ok && result.error) addToast(`No pudimos renombrar: ${result.error}`, 'error');
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      onClose();
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <motion.aside
        id="app-sidebar"
        ref={sidebarRef}
        onKeyDown={onKeyDown}
        className={`sidebar-container${isOpen ? ' open' : ''}${isCollapsed ? ' collapsed' : ''}`}
        aria-hidden={isMobile && !isOpen ? true : undefined}
        initial={false}
        animate={{
          width: isMobile ? 'min(260px, calc(100vw - 24px))' : isCollapsed ? 56 : 260,
          x: isMobile && !isOpen ? '-100%' : 0,
        }}
        transition={
          isMobile
            ? { duration: SIDEBAR_MOTION.slow, ease: SIDEBAR_MOTION.ease }
            : SIDEBAR_MOTION.spring
        }
      >
        <SidebarHeader
          isCollapsed={isCollapsed}
          isMobile={isMobile}
          onClose={onClose}
          onToggleCollapse={onToggleCollapse}
        />

        <div className="sidebar-content">
          <SidebarNavigation
            isCollapsed={isCollapsed}
            showConversations={showConversations}
            creatingNew={creatingNew}
            onClose={onClose}
            onNewChat={handleNewChat}
            onOpenLibrary={() => {
              setExplorerOpen(true);
              onClose();
            }}
          />

          {secondaryContent && <div className="sidebar-secondary-scroll">{secondaryContent}</div>}

          {showConversations && (
            <>
              {newChatError && (
                <p className="sidebar-error" role="alert">
                  {newChatError}
                </p>
              )}
              <div className="sidebar-search-region">
                <SidebarSearch
                  isCollapsed={isCollapsed}
                  shortcutEnabled={!isMobile || isOpen}
                  isOpen={isSearchOpen}
                  query={searchQuery}
                  onChange={setSearchQuery}
                  onOpenChange={setIsSearchOpen}
                />
              </div>
              <div className="sidebar-conversations-scroll">
                <ChatThreadList
                  conversations={filteredConversations}
                  loading={loading}
                  query={debouncedQuery}
                  isCollapsed={isCollapsed}
                  activeConversationId={activeConversationId}
                  runtimeByConversationId={runtimeByConversationId}
                  onNewChat={handleNewChat}
                  onSelect={(id) => {
                    navigate(`/c/${id}`);
                    onClose();
                  }}
                  onDeleteRequest={handleDeleteRequest}
                  onRename={handleRename}
                  error={Boolean(error)}
                  onRetry={() => void refetch()}
                  creating={creatingNew}
                  onRequestExpand={() => onToggleCollapse()}
                />
              </div>
            </>
          )}
        </div>

        {showConversations && user && (
          <DailyQuotaCounter
            isCollapsed={isCollapsed}
            used={user.messages_used_today}
            remaining={user.messages_remaining_today}
            resetsAt={user.rate_window_resets_at}
          />
        )}

        <div className="sidebar-footer">
          {user && (
            <SidebarUserMenu
              email={user.email}
              isAdmin={user.is_admin}
              isCollapsed={isCollapsed}
              loggingOut={loggingOut}
              onClose={onClose}
              onLogout={handleLogout}
            />
          )}
          <span className="sidebar-footer-brand sidebar-label">Dental AI Assistant</span>
        </div>
      </motion.aside>

      {confirmId && (
        <ConfirmDialog
          title="¿Eliminar conversación?"
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          tone="danger"
          busy={deleting}
          error={deleteError ? 'No pudimos eliminarla. Intenta nuevamente.' : null}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => {
            setConfirmId(null);
            setDeleteError(false);
          }}
        />
      )}

      {showConversations && (
        <VideoExplorer isOpen={explorerOpen} onClose={() => setExplorerOpen(false)} />
      )}
    </>
  );
}
