import { type MutableRefObject, type ReactNode, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';

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
  const localConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const conversationsRef = suppliedConversationsRef ?? localConversationsRef;

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversationsRef={conversationsRef}
        showConversations={showConversations}
      />
      <div className="main-area">
        <button
          type="button"
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir navegacion"
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
            <line x1="2" y1="4.5" x2="16" y2="4.5" />
            <line x1="2" y1="9" x2="16" y2="9" />
            <line x1="2" y1="13.5" x2="16" y2="13.5" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
