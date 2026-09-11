import { PanelLeftOpen } from 'lucide-react';
import {
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { RuntimeByConversationId } from '../hooks/useStreamingResponse';
import { TransitionGuardBoundary } from '../hooks/useTransitionGuard';
import { DriveBootstrapBanner } from './DriveBootstrapBanner';
import { Sidebar } from './Sidebar';
import { ResizableGroup, ResizableHandle, ResizablePanel } from './ui/resizable';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DRIVE_LAYOUT_KEY = 'dental.drive.workspace.layout.v1';

function readDriveLayout(): { main: number; accessory: number } {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRIVE_LAYOUT_KEY) ?? 'null') as {
      main?: unknown;
      accessory?: unknown;
    } | null;
    if (typeof parsed?.main !== 'number' || typeof parsed.accessory !== 'number') {
      return { main: 68, accessory: 32 };
    }
    const main = Math.min(72, Math.max(58, parsed.main));
    const accessory = Math.min(40, Math.max(28, parsed.accessory));
    return { main, accessory };
  } catch {
    return { main: 68, accessory: 32 };
  }
}

export interface AppShellUtility {
  id: string;
  label: string;
  onActivate: () => void;
}

interface AppShellProps {
  children: ReactNode;
  activeConversationId?: string;
  showConversations?: boolean;
  conversationsRef?: MutableRefObject<(() => Promise<void>) | null>;
  runtimeByConversationId?: RuntimeByConversationId;
  secondarySidebarContent?: (isCollapsed: boolean, onRequestExpand: () => void) => ReactNode;
  workspaceMode?: boolean;
  utilities?: AppShellUtility[];
  workspaceAccessory?: ReactNode;
}

export function AppShell({
  children,
  activeConversationId,
  showConversations = false,
  conversationsRef: suppliedConversationsRef,
  runtimeByConversationId,
  secondarySidebarContent,
  workspaceMode = false,
  utilities = [],
  workspaceAccessory,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebar, setIsMobileSidebar] = useState(
    () => window.matchMedia?.('(max-width: 767px)').matches ?? true,
  );
  const [isCompactWorkspace, setIsCompactWorkspace] = useState(
    () => window.matchMedia?.('(max-width: 1024px)').matches ?? true,
  );
  const [workspaceLayout] = useState(readDriveLayout);
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
    const mediaQuery = window.matchMedia?.('(max-width: 1024px)');
    if (!mediaQuery) return;
    const update = () => setIsCompactWorkspace(mediaQuery.matches);
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

  const handleSidebarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!sidebarOpen) return;

    if (event.key === 'Escape') {
      if (event.defaultPrevented) return;
      event.preventDefault();
      setSidebarOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;

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
    <TransitionGuardBoundary>
      <>
        <a className="skip-link" href="#main-content">
          Saltar al contenido principal
        </a>
        <div className="app-layout">
          {isMobileSidebar && sidebarOpen && (
            <div
              aria-hidden="true"
              className="sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
            />
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
            runtimeByConversationId={runtimeByConversationId}
            secondaryContent={secondarySidebarContent?.(sidebarCollapsed, () =>
              setSidebarCollapsed(false),
            )}
            sidebarRef={sidebarRef}
            onKeyDown={handleSidebarKeyDown}
            utilities={utilities}
          />
          <div
            id="main-content"
            tabIndex={-1}
            className={`main-area${showConversations ? '' : ' patient-shell'}${workspaceMode ? ' workspace-mode' : ''}`}
          >
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
            <DriveBootstrapBanner />
            {workspaceAccessory ? (
              isCompactWorkspace ? (
                <div className="workspace-mobile-stack">
                  {children}
                  {workspaceAccessory}
                </div>
              ) : (
                <div className="workspace-row">
                  <ResizableGroup
                    id="clinical-workspace"
                    orientation="horizontal"
                    className="workspace-resizable"
                    defaultLayout={workspaceLayout}
                    onLayoutChanged={(layout) => {
                      try {
                        window.localStorage.setItem(
                          DRIVE_LAYOUT_KEY,
                          JSON.stringify({
                            main: Math.min(72, Math.max(58, layout.main ?? 68)),
                            accessory: Math.min(40, Math.max(28, layout.accessory ?? 32)),
                          }),
                        );
                      } catch {
                        // Storage is optional; the live layout still works.
                      }
                    }}
                  >
                    <ResizablePanel
                      id="main"
                      defaultSize="68"
                      minSize="58"
                      className="workspace-panel-main"
                    >
                      {children}
                    </ResizablePanel>
                    <ResizableHandle className="workspace-resize-handle" />
                    <ResizablePanel
                      id="accessory"
                      defaultSize="32"
                      minSize="28"
                      maxSize="40"
                      className="workspace-panel-accessory"
                    >
                      {workspaceAccessory}
                    </ResizablePanel>
                  </ResizableGroup>
                </div>
              )
            ) : (
              children
            )}
          </div>
        </div>
      </>
    </TransitionGuardBoundary>
  );
}
