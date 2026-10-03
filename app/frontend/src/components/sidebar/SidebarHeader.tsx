import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { DentalToothIcon } from '../DentalToothIcon';
import { SIDEBAR_MOTION } from './sidebarMotion';

interface SidebarHeaderProps {
  isCollapsed: boolean;
  isMobile: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export function SidebarHeader({
  isCollapsed,
  isMobile,
  onClose,
  onToggleCollapse,
}: SidebarHeaderProps) {
  const label = isMobile
    ? 'Cerrar navegación'
    : isCollapsed
      ? 'Expandir navegación'
      : 'Colapsar navegación';

  return (
    <header className="sidebar-header">
      <Link
        to="/patients"
        onClick={onClose}
        className="sidebar-brand"
        aria-label="Dental AI Assistant"
        title="Dental AI Assistant"
        data-tooltip={isCollapsed ? 'Dental AI Assistant' : undefined}
      >
        <span
          className="sidebar-brand-mark inline-flex items-center justify-center text-white"
          aria-hidden="true"
        >
          <DentalToothIcon className="size-4" />
        </span>
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.span
              className="sidebar-brand-name sidebar-label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: SIDEBAR_MOTION.fast, ease: SIDEBAR_MOTION.ease }}
            >
              Dental AI Assistant
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
      <button
        type="button"
        className="sidebar-icon-button"
        onClick={isMobile ? onClose : onToggleCollapse}
        aria-controls="app-sidebar"
        aria-expanded={isMobile || !isCollapsed}
        aria-label={label}
        title={label}
        data-tooltip={label}
      >
        {isCollapsed ? (
          <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.7} />
        ) : (
          <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.7} />
        )}
      </button>
    </header>
  );
}
