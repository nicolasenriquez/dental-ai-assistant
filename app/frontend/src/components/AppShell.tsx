import { PanelLeftOpen } from 'lucide-react';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebar, setIsMobileSidebar] = useState(
    () => window.matchMedia?.('(max-width: 767px)').matches ?? true,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarWasOpen = useRef(false);
  const localConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const conversationsRef = suppliedConversationsRef ?? localConversationsRef;

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 767px)');
    if (!mediaQuery) return;

    const update = () => {
      setIsMobileSidebar(mediaQuery.matches);
      if (mediaQuery.matches) setSidebarCollapsed(false);
    };
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const hidden = isMobileSidebar && !sidebarOpen;
    sidebar.toggleAttribute('inert', hidden);
    return () => sidebar.removeAttribute('inert');
  }, [isMobileSidebar, sidebarCollapsed, sidebarOpen]);

  useEffect(() => {
    if (sidebarOpen) {
      sidebarWasOpen.current = true;
      const firstLink = sidebarRef.current?.querySelector<HTMLElement>('a[href]');
      if (firstLink) {
        firstLink.focus();
      } else {
        sidebarRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      }
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
      {isMobileSidebar && sidebarOpen && (
        <div aria-hidden="true" className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversationsRef={conversationsRef}
        showConversations={showConversations}
        isMobile={isMobileSidebar}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        sidebarRef={sidebarRef}
        onKeyDown={handleSidebarKeyDown}
      />
      <div className={`main-area${showConversations ? '' : ' patient-shell'}`}>
        {isMobileSidebar && !sidebarOpen && (
          <button
            ref={menuButtonRef}
            type="button"
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-expanded={false}
            aria-controls="app-sidebar"
            aria-label="Abrir navegación"
            title="Abrir navegación"
          >
            <PanelLeftOpen aria-hidden="true" size={18} strokeWidth={1.7} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
