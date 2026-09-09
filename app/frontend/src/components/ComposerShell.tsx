import type { ReactNode } from 'react';

interface ComposerShellProps {
  children: ReactNode;
  className?: string;
  focused?: boolean;
  disabled?: boolean;
  testId?: string;
}

export function ComposerShell({
  children,
  className = '',
  focused = false,
  disabled = false,
  testId,
}: ComposerShellProps) {
  return (
    <div
      className={`chat-composer${className ? ` ${className}` : ''}${focused ? ' is-focused' : ''}${disabled ? ' is-disabled' : ''}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
