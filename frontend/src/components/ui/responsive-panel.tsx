"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "./drawer";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "./sheet";
import { IconButton } from "./icon-button";
import { useMediaQuery } from "./use-media-query";

/** `sm:max-w-md`, the width of an inspector. */
const INSPECTOR_WIDTH = "28rem";

/**
 * Side sheet on desktop, swipeable bottom drawer on phones (below `sm`) — for booking details and other detail
 * panels. Its own module, so pages that only format dates and money don't load the drawer library with it.
 *
 * `inspector` is for opening a record: on desktop the panel stands beside the page instead of over it, with no scrim,
 * so the calendar or list stays sharp and in use, and picking another record swaps what's in the panel. Anything modal
 * keeps the sheet's blurred backdrop.
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
  inspector = false,
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
  inspector?: boolean;
  children: React.ReactNode;
}) {
  const mobile = useMediaQuery("(max-width: 639px)");
  const beside = inspector && open && !mobile;
  // From a wide window up the shell's main column gives up the panel's width, so nothing is left underneath it.
  useEffect(() => {
    if (!beside) return;
    document.documentElement.style.setProperty("--inspector-width", INSPECTOR_WIDTH);
    return () => {
      document.documentElement.style.removeProperty("--inspector-width");
    };
  }, [beside]);
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
    <Sheet open={open} onOpenChange={onOpenChange} modal={!inspector}>
      <SheetContent
        size={inspector ? "md" : size}
        className={className}
        aria-describedby={undefined}
        bare={inspector}
        // The page beside it stays in use: clicking there never closes the panel.
        onInteractOutside={inspector ? (e) => e.preventDefault() : undefined}
      >
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
