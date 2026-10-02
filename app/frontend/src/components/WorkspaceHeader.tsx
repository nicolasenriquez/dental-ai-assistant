import type { ReactNode } from 'react';

interface WorkspaceHeaderProps {
  title: string;
  description?: string;
  workspaceContext?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
}

export function WorkspaceHeader({
  title,
  description,
  workspaceContext,
  actions,
  navigation,
}: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-header__copy">
        {navigation}
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {workspaceContext && <div className="workspace-header__context">{workspaceContext}</div>}
      {actions && <div className="workspace-header__actions">{actions}</div>}
    </header>
  );
}
