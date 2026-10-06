import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  headingLevel?: 1 | 2;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  headingLevel = 1,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  return (
    <section className={cn('chat-empty-state', className)}>
      {icon}
      <Heading>{title}</Heading>
      {description ? <p>{description}</p> : null}
      {action}
    </section>
  );
}
