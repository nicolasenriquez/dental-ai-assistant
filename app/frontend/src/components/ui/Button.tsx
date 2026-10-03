import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

const VARIANT_CLASSES = {
  primary: 'btn-primary',
  clinical: 'clinical-primary-button',
  clinicalSecondary: 'clinical-secondary-button',
  drive: 'drive-btn drive-btn-primary',
  driveSecondary: 'drive-btn drive-btn-secondary',
  driveIcon: 'drive-btn drive-btn-icon',
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export function buttonVariants({
  variant,
  className,
}: {
  variant: ButtonVariant;
  className?: string;
}): string {
  return cn(VARIANT_CLASSES[variant], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonVariants({ variant, className })} {...props} />
  );
});
