import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className = '', ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={`drive-dialog-overlay ${className}`.trim()}
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>
>(({ className = '', children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={`drive-sheet-content ${className}`.trim()}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="drive-sheet-close" aria-label="Cerrar">
        <X aria-hidden="true" size={16} strokeWidth={1.7} />
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

function SheetHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`drive-sheet-header ${className}`.trim()} {...props} />;
}

function SheetFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`drive-sheet-footer ${className}`.trim()} {...props} />;
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className = '', ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={`drive-sheet-title ${className}`.trim()} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className = '', ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={`drive-sheet-description ${className}`.trim()}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export { SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetTitle };
