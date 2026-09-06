import { Search } from 'lucide-react';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from 'react';

interface SidebarSearchProps {
  isCollapsed: boolean;
  shortcutEnabled: boolean;
  isOpen: boolean;
  query: string;
  onChange: (query: string) => void;
  onOpenChange: (open: boolean) => void;
}

export function SidebarSearch({
  isCollapsed,
  shortcutEnabled,
  isOpen,
  query,
  onChange,
  onOpenChange,
}: SidebarSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!shortcutEnabled) return;

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [onOpenChange, shortcutEnabled]);

  const shortcutLabel = navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K';

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="sidebar-search-trigger"
        onClick={() => {
          onOpenChange(true);
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label="Buscar conversaciones"
        title={`Buscar conversaciones (${shortcutLabel})`}
        data-tooltip={isCollapsed ? 'Buscar conversaciones' : undefined}
      >
        <Search aria-hidden="true" size={16} strokeWidth={1.7} />
        <span className="sidebar-label">Buscar</span>
        {!isCollapsed && <kbd>{shortcutLabel}</kbd>}
      </button>
    );
  }

  return (
    <div className={`sidebar-search${isCollapsed ? ' sidebar-search--rail' : ''}`}>
      <Search aria-hidden="true" size={16} strokeWidth={1.7} />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Buscar conversaciones"
        placeholder="Buscar conversaciones"
        aria-keyshortcuts="Control+K Meta+K"
      />
    </div>
  );
}
