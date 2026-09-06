import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
      <div className="sidebar-brand" title="DynaChat">
        <img src="/logo.svg" alt="" aria-hidden="true" className="sidebar-brand-mark" />
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.span
              className="sidebar-brand-name sidebar-label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: SIDEBAR_MOTION.fast, ease: SIDEBAR_MOTION.ease }}
            >
              DynaChat
            </motion.span>
          )}
        </AnimatePresence>
      </div>
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
