import {
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Sidebar } from './Sidebar';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AppShellProps {
  children: ReactNode;
  activeConversationId?: string;
  showConversations?: boolean;
  conversationsRef?: MutableRefObject<(() => Promise<void>) | null>;
}

export function AppShell({
  children,
  activeConversationId,
  showConversations = false,
  conversationsRef: suppliedConversationsRef,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileSidebar, setIsMobileSidebar] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarWasOpen = useRef(false);
  const localConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const conversationsRef = suppliedConversationsRef ?? localConversationsRef;

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 767px)');
    if (!mediaQuery) return;

    const update = () => setIsMobileSidebar(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || !isMobileSidebar) return;

    sidebar.toggleAttribute('inert', !sidebarOpen);
    return () => sidebar.removeAttribute('inert');
  }, [isMobileSidebar, sidebarOpen]);

  useEffect(() => {
    if (sidebarOpen) {
      sidebarWasOpen.current = true;
      sidebarRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      return;
    }

    if (sidebarWasOpen.current) {
      sidebarWasOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  const handleSidebarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!sidebarOpen || event.key !== 'Tab') return;

    const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div aria-hidden="true" className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversationsRef={conversationsRef}
        showConversations={showConversations}
        isMobile={isMobileSidebar}
        sidebarRef={sidebarRef}
        onKeyDown={handleSidebarKeyDown}
      />
      <div className={`main-area${showConversations ? '' : ' patient-shell'}`}>
        <button
          ref={menuButtonRef}
          type="button"
          className="hamburger-btn"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          aria-label={sidebarOpen ? 'Cerrar navegación' : 'Abrir navegación'}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {sidebarOpen ? (
              <>
                <line x1="4" y1="4" x2="14" y2="14" />
                <line x1="14" y1="4" x2="4" y2="14" />
              </>
            ) : (
              <>
                <line x1="2" y1="4.5" x2="16" y2="4.5" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="13.5" x2="16" y2="13.5" />
              </>
            )}
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
