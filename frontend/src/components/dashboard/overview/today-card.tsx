"use client";

import { CalendarDays, CalendarPlus } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";

/** Today's bookings in order, with a "now" divider; past ones faded. */
export function TodayCard({ bookings, loading, now }: { bookings: Booking[]; loading: boolean; now: Date }) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { openBooking, openNewBooking } = useBookingActions();
  const nowIndex = bookings.findIndex((b) => new Date(b.start) > now);

  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2}>Today&apos;s {v("bookings")}</CardTitle>
      </CardHeader>
      <CardContent className="-mx-2 pb-3">
        {loading ? (
          <div className="flex flex-col px-2" aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex h-15 items-center gap-3">
                <Skeleton className="h-4 w-11" />
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<CalendarDays />}
            title={`Nothing booked today`}
            description={`New ${v("bookings")} show up here as they come in.`}
            action={
              <Button size="sm" variant="secondary" onClick={() => openNewBooking()}>
                <CalendarPlus /> New {v("booking")}
              </Button>
            }
          />
        ) : (
          <ol className="flex flex-col">
            {bookings.map((b, i) => {
              const past = new Date(b.end) <= now;
              return (
                <li key={b.id}>
                  {i === nowIndex && i > 0 && <NowDivider label={`Now · ${fmt.time(now.toISOString())}`} />}
                  <button
                    type="button"
                    onClick={() => openBooking(b.id)}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {/* Past ones are marked by a muted time, not a faded row (that drops the text below 4.5:1). */}
                    <span
                      className={cn(
                        "tnum w-12 shrink-0 text-sm font-medium",
                        past && "text-muted-foreground",
                      )}
                    >
                      {fmt.time(b.start)}
                    </span>
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: b.service.color }}
                    />
                    <Avatar name={b.customer.name} size="md" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{b.customer.name}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {b.service.name}
                        {b.option ? ` · ${b.option.name}` : ""}
                        {b.resources.length ? ` · ${b.resources.map((r) => r.name).join(", ")}` : ""}
                      </span>
                    </span>
                    <BookingStatusBadge status={b.status} className="hidden sm:inline-flex" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function NowDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1" aria-hidden>
      <span className="size-1.5 rounded-full bg-danger" />
      <span className="h-px flex-1 bg-danger/40" />
      <span className="tnum text-2xs font-medium text-danger-soft-foreground">{label}</span>
    </div>
  );
}
