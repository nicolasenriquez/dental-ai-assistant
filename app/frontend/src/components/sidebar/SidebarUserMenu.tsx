import { Ellipsis, LogOut, Shield } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SIDEBAR_MOTION } from './sidebarMotion';

interface SidebarUserMenuProps {
  email: string;
  isAdmin: boolean;
  isCollapsed: boolean;
  loggingOut: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export function SidebarUserMenu({
  email,
  isAdmin,
  isCollapsed,
  loggingOut,
  onClose,
  onLogout,
}: SidebarUserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
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
  }, [open]);

  return (
    <div className="sidebar-user" ref={menuRef}>
      <button
        type="button"
        className="sidebar-user-trigger"
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Abrir menú de usuario para ${email}`}
        title={email}
        data-tooltip={isCollapsed ? email : undefined}
      >
        <span className="sidebar-user-email sidebar-label">{email}</span>
        <Ellipsis aria-hidden="true" size={16} strokeWidth={1.7} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="sidebar-user-menu"
            role="menu"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: SIDEBAR_MOTION.fast, ease: SIDEBAR_MOTION.ease }}
          >
            <div className="sidebar-user-menu-email" role="presentation">
              {email}
            </div>
            {isAdmin && (
              <Link
                to="/admin"
                className="sidebar-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onClose();
                }}
              >
                <Shield aria-hidden="true" size={16} strokeWidth={1.7} />
                Administración
              </Link>
            )}
            <button
              type="button"
              className="sidebar-menu-item sidebar-menu-item--danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              disabled={loggingOut}
            >
              <LogOut aria-hidden="true" size={16} strokeWidth={1.7} />
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
