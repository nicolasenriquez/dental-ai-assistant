import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <section className={cn('chat-empty-state', className)}>
      {icon}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {action}
    </section>
  );
}
