"use client";

import { useState } from "react";
import { Check, ListChecks, X } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { useBookings } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { useBookingActions } from "../booking/booking-actions-provider";
import { DeclineBookingDialog } from "../booking/decline-dialog";
import { useApproveAction } from "../booking/use-approve-action";
import { useFmt } from "../common";

const SHOWN = 20;

/**
 * Upcoming bookings waiting for approval (the first 20), with approve/decline; hidden when there are none. When
 * there are more, the count says so and "See all" opens the bookings list filtered to them.
 */
export function PendingApprovals({ today }: { today: string }) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { openBooking } = useBookingActions();
  const pending = useBookings(business.id, { status: "pending_approval", from: today, limit: SHOWN });
  const approval = useApproveAction();
  const [declining, setDeclining] = useState<Booking | null>(null);
  const items = pending.data?.items ?? [];
  const more = !!pending.data?.nextCursor;
  if (pending.isPending || items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2} className="flex items-center gap-2">
          Waiting for approval <Badge tone="info">{more ? `${items.length}+` : items.length}</Badge>
        </CardTitle>
        <CardDescription>{v("customers", { title: true })} hear back as soon as you decide.</CardDescription>
        {more && (
          <CardAction>
            <ActionButton
              variant="ghost"
              size="sm"
              href={`${dashboardHref(business.slug, "bookings")}?status=pending_approval`}
              icon={<ListChecks />}
              label="See all"
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col px-3 pb-3">
        {items.map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/60">
            <button
              type="button"
              onClick={() => openBooking(b.id)}
              className="flex min-w-0 flex-1 flex-col text-left"
            >
              <span className="truncate text-sm font-medium">{b.customer.name}</span>
              <span className="tnum truncate text-xs text-muted-foreground">
                {b.service.name} · {fmt.relDay(b.start)}, {fmt.time(b.start)}
              </span>
            </button>
            <IconButton label={`Decline ${b.customer.name}`} variant="ghost" onClick={() => setDeclining(b)}>
              <X />
            </IconButton>
            <IconButton
              label={`Approve ${b.customer.name}`}
              variant="secondary"
              loading={approval.isApproving(b.id)}
              onClick={() => approval.approve(b.id)}
            >
              <Check />
            </IconButton>
          </div>
        ))}
      </CardContent>
      {declining && (
        <DeclineBookingDialog booking={declining} open onOpenChange={(open) => !open && setDeclining(null)} />
      )}
    </Card>
  );
}
