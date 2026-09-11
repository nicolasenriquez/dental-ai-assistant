import type { ReactNode } from 'react';

interface AlertProps {
  className?: string;
  children: ReactNode;
}

export function Alert({ className = '', children }: AlertProps) {
  return (
    <div role="alert" className={`drive-alert ${className}`.trim()}>
      {children}
    </div>
  );
}

export function AlertTitle({ className = '', children }: AlertProps) {
  return <h3 className={`drive-alert-title ${className}`.trim()}>{children}</h3>;
}

export function AlertDescription({ className = '', children }: AlertProps) {
  return <p className={`drive-alert-description ${className}`.trim()}>{children}</p>;
}
