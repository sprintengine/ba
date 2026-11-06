"use client";

import { X } from "lucide-react";
import { useBooking } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { BookingActionsBar } from "@/components/dashboard/booking/booking-actions-bar";
import { BookingDetailBody } from "@/components/dashboard/booking/booking-detail-body";
import {
  BookingPanelBadges,
  BookingPanelName,
  BookingPanelWhen,
} from "@/components/dashboard/booking/booking-panel-head";
import { SheetFooter, SheetHeader, SHEET_SURFACE, SHEET_TITLE } from "@/components/ui/sheet";
import { SAMPLE_BUSINESS } from "./fixture-api";

/** The booking's side sheet: the app's own head, body and actions, in the window rather than over the page. */
export function BookingPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useBooking(SAMPLE_BUSINESS.id, id);
  const b = detail.data;
  if (!b) return null;
  return (
    <div className="absolute inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-[7px]" />
      <div
        style={{ right: "var(--tour-covered, 0px)" }}
        className={cn(
          SHEET_SURFACE,
          "absolute inset-y-0 w-full max-w-xl animate-sheet-in-right border-l border-border",
        )}
      >
        <SheetHeader>
          <h2 className={SHEET_TITLE}>
            <BookingPanelName booking={b} />
          </h2>
          <div className="text-sm text-muted-foreground">
            <BookingPanelWhen booking={b} />
          </div>
          <BookingPanelBadges booking={b} />
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-5 py-5">
          <BookingDetailBody booking={b} />
        </div>
        <SheetFooter className="flex-wrap">
          <BookingActionsBar booking={b} />
        </SheetFooter>
        <button
          type="button"
          data-tour="close"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
