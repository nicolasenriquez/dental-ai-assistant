import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as React from 'react';

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className = '', children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={`drive-scroll-area ${className}`.trim()}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="drive-scroll-viewport">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaBar orientation="vertical" />
    <ScrollAreaBar orientation="horizontal" />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollAreaBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className = '', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    className={`drive-scroll-bar ${className}`.trim()}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="drive-scroll-thumb" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollAreaBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollAreaBar };
