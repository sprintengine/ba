"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarHeart, Plug } from "lucide-react";
import { useMe, useMyBookings } from "@/lib/api/hooks";
import type { CustomerBooking } from "@/lib/api/types";
import { businessesIn, sortByStart } from "@/lib/booking/booking";
import { formatRelativeDay, toTimeOfDay } from "@/lib/format";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { ErrorState } from "@/components/common/feedback";
import { BusinessTile } from "@/components/shells/business-tile";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvitationBanner } from "./invitation-banner";
import { MyBookingCard } from "./my-booking-card";
import type { MyBookingsAgentRequest } from "./my-bookings-agent-tools";
import { useMyBookingsAgentTools } from "./use-my-bookings-agent-tools";

type Tab = "upcoming" | "past";
/** Bookings shown at first, and added by "Show more". */
const PAGE_SIZE = 20;

export function MyBookingsPage() {
  const { params, setParams } = useUrlParams();
  const tab: Tab = params.get("tab") === "past" ? "past" : "upcoming";
  const bookings = useMyBookings();
  const me = useMe();
  // A change an AI agent in the browser started (WebMCP): the booking's own dialog shows it for the customer to confirm.
  // It lapses once the booking is no longer upcoming (cancelled meanwhile, elsewhere).
  const [agentRequest, setAgentRequest] = useState<MyBookingsAgentRequest | null>(null);
  const pending =
    agentRequest && bookings.data?.upcoming.some((b) => b.id === agentRequest.bookingId)
      ? agentRequest
      : null;

  const setTab = (t: string) => setParams({ tab: t === "past" ? "past" : null });
  useMyBookingsAgentTools({
    bookings: bookings.data,
    pending,
    request: (r) => {
      if (tab !== "upcoming") setTab("upcoming");
      setAgentRequest(r);
    },
  });

  return (
    <>
      <PageHeader
        title="My bookings"
        actions={
          <ActionButton
            href="/my/connected-apps"
            icon={<Plug />}
            label="Connected apps"
            variant="ghost"
            collapse={false}
            // On a phone it would take a line of its own; the account menu has it.
            className="max-sm:hidden"
          />
        }
      />
      {me.data && me.data.pendingInvitations.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {me.data.pendingInvitations.map((inv) => (
            <InvitationBanner key={inv.token} invitation={inv} />
          ))}
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Bookings">
          <TabsTrigger value="upcoming">
            Upcoming {bookings.data && <Count n={bookings.data.upcoming.length} />}
          </TabsTrigger>
          <TabsTrigger value="past">
            Past and cancelled {bookings.data && <Count n={bookings.data.past.length} />}
          </TabsTrigger>
        </TabsList>
        {/* The tab's panel (its trigger's aria-controls points here). */}
        <TabsContent value={tab} className="pt-6">
          {bookings.isError ? (
            <ErrorState headingLevel={2} error={bookings.error} onRetry={() => bookings.refetch()} />
          ) : !bookings.data ? (
            <div className="flex flex-col gap-3" role="status" aria-busy aria-label="Loading bookings">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : (
            <BookingList
              key={tab}
              tab={tab}
              items={tab === "upcoming" ? bookings.data.upcoming : bookings.data.past}
              past={bookings.data.past}
              agentRequest={tab === "upcoming" ? pending : null}
              onAgentRequestDone={(done) => setAgentRequest((current) => (current === done ? null : current))}
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

const relativeDay = (b: CustomerBooking) => formatRelativeDay(b.start, b.timezone);

/**
 * Bookings under the day each heading names, in the order their times read: a list spanning businesses in several
 * timezones would otherwise look shuffled. Keyed by the heading, so two timezones' "Today" are one day on the page.
 */
function byDay(bookings: CustomerBooking[]) {
  const days = new Map<string, CustomerBooking[]>();
  for (const b of bookings) {
    const day = relativeDay(b);
    days.set(day, [...(days.get(day) ?? []), b]);
  }
  const readOrder = (b: CustomerBooking) => toTimeOfDay(b.start, b.timezone);
  return [...days].map(([day, list]) => ({
    day,
    bookings: list.sort((x, y) => readOrder(x).localeCompare(readOrder(y))),
  }));
}

function Count({ n }: { n: number }) {
  return <span className="tnum ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{n}</span>;
}

function BookingList({
  tab,
  items,
  past,
  agentRequest,
  onAgentRequestDone,
}: {
  tab: Tab;
  items: CustomerBooking[];
  past: CustomerBooking[];
  agentRequest: MyBookingsAgentRequest | null;
  /** The customer closed the dialog of `request`. */
  onAgentRequestDone: (request: MyBookingsAgentRequest) => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  if (items.length === 0) {
    const previous = businessesIn(past, 4);
    return (
      <EmptyState
        headingLevel={2}
        icon={<CalendarHeart />}
        title={tab === "upcoming" ? "Nothing coming up" : "No past bookings yet"}
        description={
          tab === "upcoming"
            ? "Anything you book with a business on bookanything shows up here, wherever you booked it."
            : "Bookings you've had will be listed here."
        }
        action={
          tab === "upcoming" && previous.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-subtle-foreground">Book again with</p>
              <div className="flex flex-wrap justify-center gap-2">
                {previous.map((b) => (
                  <Button key={b.slug} asChild variant="secondary">
                    <Link href={`/${b.slug}`}>
                      <BusinessTile
                        name={b.name}
                        logoUrl={b.branding.logoUrl}
                        color={b.branding.primaryColor}
                        size="sm"
                      />
                      {b.name}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          ) : tab === "upcoming" ? (
            <Button asChild variant="secondary">
              <Link href="/explore">Find somewhere to book</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  const sorted = sortByStart(items, tab);
  // An agent's request can point at any booking, so the list always reaches it.
  const requested = agentRequest ? sorted.findIndex((b) => b.id === agentRequest.bookingId) + 1 : 0;
  const shown = sorted.slice(0, Math.max(limit, requested));
  // The one that matters most, on its own; everything after it is a quiet list.
  const next = tab === "upcoming" ? shown[0] : undefined;
  const rest = next ? shown.slice(1) : shown;
  return (
    <div className="flex flex-col gap-8">
      {next && (
        <section aria-label="Your next booking">
          <h2 className="pb-2 text-sm font-semibold">Next, {relativeDay(next).toLowerCase()}</h2>
          <MyBookingCard
            booking={next}
            past={false}
            featured
            agentAction={agentRequest?.bookingId === next.id ? agentRequest.action : null}
            onAgentActionDone={() => agentRequest && onAgentRequestDone(agentRequest)}
          />
        </section>
      )}
      {byDay(rest).map(({ day, bookings }) => (
        <section key={day}>
          <h2 className="pb-2 text-sm font-semibold">{day}</h2>
          <ul className="flex flex-col divide-y divide-border-subtle border-y border-border">
            {bookings.map((b) => (
              <li key={b.id}>
                <MyBookingCard
                  booking={b}
                  past={tab === "past"}
                  agentAction={agentRequest?.bookingId === b.id ? agentRequest.action : null}
                  onAgentActionDone={() => agentRequest && onAgentRequestDone(agentRequest)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {shown.length < sorted.length && (
        <Button variant="secondary" className="self-center" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more ({sorted.length - shown.length} left)
        </Button>
      )}
    </div>
  );
}
