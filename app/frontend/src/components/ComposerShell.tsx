import type { KeyboardEventHandler, ReactNode } from 'react';

interface ComposerShellProps {
  children: ReactNode;
  className?: string;
  focused?: boolean;
  disabled?: boolean;
  testId?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

export function ComposerShell({
  children,
  className = '',
  focused = false,
  disabled = false,
  testId,
  onKeyDown,
}: ComposerShellProps) {
  return (
    <div
      className={`chat-composer${className ? ` ${className}` : ''}${focused ? ' is-focused' : ''}${disabled ? ' is-disabled' : ''}`}
      data-testid={testId}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
