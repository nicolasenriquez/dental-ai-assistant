import type { ReactNode } from 'react';

interface WorkspaceHeaderProps {
  title: string;
  description?: string;
  workspaceContext?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  headingLevel?: 1 | 2;
}

export function WorkspaceHeader({
  title,
  description,
  workspaceContext,
  actions,
  navigation,
  headingLevel = 1,
}: WorkspaceHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className="workspace-header">
      <div className="workspace-header__copy">
        {navigation}
        <Heading>{title}</Heading>
        {description && <span>{description}</span>}
      </div>
      {workspaceContext && <div className="workspace-header__context">{workspaceContext}</div>}
      {actions && <div className="workspace-header__actions">{actions}</div>}
    </header>
  );
}
