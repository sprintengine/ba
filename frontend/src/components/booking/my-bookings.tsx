"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarHeart, Plug } from "lucide-react";
import { useMe, useMyBookings } from "@/lib/api/hooks";
import type { CustomerBooking } from "@/lib/api/types";
import { businessesIn, sortByStart } from "@/lib/booking/booking";
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
        description="Everything you've booked on bookanything, in one place."
        actions={
          <ActionButton href="/my/connected-apps" icon={<Plug />} label="Connected apps" variant="ghost" />
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
            Past {bookings.data && <Count n={bookings.data.past.length} />}
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
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((b) => (
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
  );
}
