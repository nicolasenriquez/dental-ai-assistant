import type { ReactNode } from 'react';

interface WorkspaceHeaderProps {
  title: string;
  description?: string;
  workspaceContext?: ReactNode;
  actions?: ReactNode;
}

export function WorkspaceHeader({
  title,
  description,
  workspaceContext,
  actions,
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header__copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {workspaceContext && <div className="workspace-header__context">{workspaceContext}</div>}
      {actions && <div className="workspace-header__actions">{actions}</div>}
    </header>
  );
}
