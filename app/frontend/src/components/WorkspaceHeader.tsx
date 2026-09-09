import type { ReactNode } from 'react';

interface WorkspaceHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function WorkspaceHeader({ title, description, actions }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header__copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {actions && <div className="workspace-header__actions">{actions}</div>}
    </header>
  );
}
