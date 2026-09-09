import { Library, MessageCircle, SquarePen, Stethoscope, UsersRound } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SIDEBAR_MOTION } from './sidebarMotion';

interface SidebarNavigationProps {
  isCollapsed: boolean;
  showConversations: boolean;
  creatingNew: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenLibrary: () => void;
}

interface NavigationItemProps {
  active: boolean;
  children: ReactNode;
}

function NavigationItem({ active, children }: NavigationItemProps) {
  return (
    <div className={`sidebar-nav-item${active ? ' is-active' : ''}`}>
      {active && (
        <motion.span
          layoutId="sidebar-active-item"
          className="sidebar-active-indicator"
          transition={SIDEBAR_MOTION.spring}
        />
      )}
      {children}
    </div>
  );
}

export function SidebarNavigation({
  isCollapsed,
  showConversations,
  creatingNew,
  onClose,
  onNewChat,
  onOpenLibrary,
}: SidebarNavigationProps) {
  const location = useLocation();
  const patientsActive = location.pathname.startsWith('/patients');
  const assistantActive =
    location.pathname.startsWith('/assistant') || location.pathname.startsWith('/a/');
  const chatActive = location.pathname === '/chat' || location.pathname.startsWith('/c/');

  return (
    <LayoutGroup id="sidebar-navigation">
      <nav aria-label="Navegación principal" className="sidebar-navigation">
        <NavigationItem active={patientsActive}>
          <Link
            to="/patients"
            onClick={onClose}
            aria-current={patientsActive ? 'page' : undefined}
            className="sidebar-nav-button"
            aria-label={isCollapsed ? 'Pacientes' : undefined}
            title={isCollapsed ? 'Pacientes' : undefined}
            data-tooltip={isCollapsed ? 'Pacientes' : undefined}
          >
            <UsersRound aria-hidden="true" size={16} strokeWidth={1.7} />
            <span className="sidebar-label">Pacientes</span>
          </Link>
        </NavigationItem>

        <NavigationItem active={assistantActive}>
          <Link
            to="/assistant"
            onClick={onClose}
            aria-current={assistantActive ? 'page' : undefined}
            className="sidebar-nav-button"
            aria-label={isCollapsed ? 'Asistente' : undefined}
            title={isCollapsed ? 'Asistente' : undefined}
            data-tooltip={isCollapsed ? 'Asistente' : undefined}
          >
            <Stethoscope aria-hidden="true" size={16} strokeWidth={1.7} />
            <span className="sidebar-label">Asistente</span>
          </Link>
        </NavigationItem>

        <NavigationItem active={chatActive}>
          <Link
            to="/chat"
            onClick={onClose}
            aria-current={chatActive ? 'page' : undefined}
            className="sidebar-nav-button"
            aria-label={isCollapsed ? 'Chat' : undefined}
            title={isCollapsed ? 'Chat' : undefined}
            data-tooltip={isCollapsed ? 'Chat' : undefined}
          >
            <MessageCircle aria-hidden="true" size={16} strokeWidth={1.7} />
            <span className="sidebar-label">Chat</span>
          </Link>
        </NavigationItem>

        {showConversations && (
          <NavigationItem active={false}>
            <button
              type="button"
              className="sidebar-nav-button"
              onClick={onOpenLibrary}
              aria-label={isCollapsed ? 'Biblioteca' : undefined}
              title={isCollapsed ? 'Biblioteca' : undefined}
              data-tooltip={isCollapsed ? 'Biblioteca' : undefined}
            >
              <Library aria-hidden="true" size={16} strokeWidth={1.7} />
              <span className="sidebar-label">Biblioteca</span>
            </button>
          </NavigationItem>
        )}

        {showConversations && (
          <NavigationItem active={false}>
            <button
              type="button"
              className="sidebar-nav-button sidebar-new-chat"
              onClick={onNewChat}
              disabled={creatingNew}
              aria-label={isCollapsed ? 'Nuevo chat' : undefined}
              title={isCollapsed ? 'Nuevo chat' : undefined}
              data-tooltip={isCollapsed ? 'Nuevo chat' : undefined}
            >
              <SquarePen aria-hidden="true" size={16} strokeWidth={1.7} />
              <span className="sidebar-label">{creatingNew ? 'Creando…' : 'Nuevo chat'}</span>
            </button>
          </NavigationItem>
        )}
      </nav>
    </LayoutGroup>
  );
}
