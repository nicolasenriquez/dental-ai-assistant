import type { ReactNode } from 'react';

interface DriveAlertProps {
  className?: string;
  children: ReactNode;
}

export function DriveAlert({ className = '', children }: DriveAlertProps) {
  return (
    <div role="alert" className={`drive-alert ${className}`.trim()}>
      {children}
    </div>
  );
}

export function DriveAlertTitle({ className = '', children }: DriveAlertProps) {
  return <h3 className={`drive-alert-title ${className}`.trim()}>{children}</h3>;
}

export function DriveAlertDescription({ className = '', children }: DriveAlertProps) {
  return <p className={`drive-alert-description ${className}`.trim()}>{children}</p>;
}
