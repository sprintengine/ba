"use client";

import type { BookingDetail } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { PanelSection, useFmt } from "../common";
import { auditActionLabel, auditActorLabel, auditDetail } from "@/lib/dashboard/booking-copy";

/** The booking's audit trail, newest first (hidden when empty). */
export function BookingHistory({ booking }: { booking: BookingDetail }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  const events = [...booking.history].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (events.length === 0) return null;
  return (
    <PanelSection title="History">
      <ol className="relative flex flex-col gap-4 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
        {events.map((e, i) => {
          const detail = auditDetail(e, booking.currency, fmt.dateTime);
          return (
            <li key={e.id} className="relative flex flex-col gap-0.5 text-sm">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1.5 -left-5 size-[11px] rounded-full border-2 border-background",
                  i === 0 ? "bg-brand" : "bg-border-strong",
                )}
              />
              <span className="font-medium">{auditActionLabel(e.action, v)}</span>
              <span className="text-xs text-muted-foreground">
                {auditActorLabel(e, v)} · {fmt.dateTime(e.occurredAt)}
              </span>
              {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
            </li>
          );
        })}
      </ol>
    </PanelSection>
  );
}
