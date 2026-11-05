"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, Plus } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";

/** Today's bookings in order, what's ahead first: finished ones fold into a line above, with a "now" divider. */
export function TodayCard({ bookings, loading, now }: { bookings: Booking[]; loading: boolean; now: Date }) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { openBooking, openNewBooking } = useBookingActions();
  const business = useCurrentBusiness();
  const [showDone, setShowDone] = useState(false);
  const done = bookings.filter((b) => new Date(b.end) <= now);
  const shown = showDone ? bookings : bookings.filter((b) => new Date(b.end) > now);
  const nowIndex = shown.findIndex((b) => new Date(b.start) > now);

  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2}>Today&apos;s {v("bookings")}</CardTitle>
        <CardAction>
          <Button asChild variant="link" size="xs" className="text-xs">
            <Link href={`/dashboard/${business.slug}/bookings`}>All {v("bookings")}</Link>
          </Button>
        </CardAction>
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
                <Plus /> New {v("booking")}
              </Button>
            }
          />
        ) : (
          <ol className="flex flex-col">
            {done.length > 0 && (
              <li>
                <button
                  type="button"
                  aria-expanded={showDone}
                  onClick={() => setShowDone((o) => !o)}
                  className="flex min-h-9 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn("size-4 transition-transform", showDone && "rotate-180")}
                  />
                  {done.length} finished earlier today
                </button>
              </li>
            )}
            {shown.map((b, i) => {
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
