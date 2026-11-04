"use client";

import { X } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "./drawer";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "./sheet";
import { IconButton } from "./icon-button";
import { useMediaQuery } from "./use-media-query";

/**
 * Side sheet on desktop, swipeable bottom drawer on phones (below `sm`) — for booking details and other detail
 * panels. Its own module, so pages that only format dates and money don't load the drawer library with it.
 */
export function ResponsivePanel({
  open,
  onOpenChange,
  title,
  description,
  header,
  footer,
  size = "lg",
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Extra header content under the title. */
  header?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
  children: React.ReactNode;
}) {
  const mobile = useMediaQuery("(max-width: 639px)");
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={className}>
          {/* Swipe down closes it too, but not everyone knows that: a close button like the side sheet's. */}
          <DrawerHeader className="relative border-b border-border-subtle pr-14">
            <IconButton
              label="Close"
              tooltip={false}
              className="absolute top-1 right-3"
              onClick={() => onOpenChange(false)}
            >
              <X />
            </IconButton>
            <DrawerTitle>{title}</DrawerTitle>
            {description ? (
              <DrawerDescription asChild>
                <div>{description}</div>
              </DrawerDescription>
            ) : null}
            {header}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <DrawerFooter className="flex-row flex-wrap [&>*]:flex-1">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size={size} className={className} aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription asChild>
              <div>{description}</div>
            </SheetDescription>
          ) : null}
          {header}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <SheetFooter className="flex-wrap">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
