"use client";

import { BOOKING_STATUS, PAYMENT_STATUS } from "@/lib/status";
import type { BookingStatus, PaymentStatus } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { Demo, Section } from "./section";

export function BadgesSection() {
  return (
    <Section
      id="badges"
      title="Badges & statuses"
      description="Badge tones; StatusBadge maps booking/payment statuses (src/lib/status.ts)."
    >
      <div className="flex flex-col gap-5">
        <Demo label="Tones">
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success" dot>
            Active
          </Badge>
          <Badge tone="warning">Draft</Badge>
          <Badge tone="danger">Suspended</Badge>
          <Badge tone="info">New</Badge>
          <Badge tone="outline">Outline</Badge>
          <Badge tone="solid">Pro</Badge>
        </Demo>
        <Demo label="Booking status">
          {(Object.keys(BOOKING_STATUS) as BookingStatus[]).map((s) => (
            <BookingStatusBadge key={s} status={s} />
          ))}
        </Demo>
        <Demo label="Payment status">
          {(Object.keys(PAYMENT_STATUS) as PaymentStatus[]).map((s) => (
            <PaymentStatusBadge key={s} status={s} />
          ))}
        </Demo>
        <Demo label="Kbd">
          <span className="flex gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
          <Kbd>Esc</Kbd>
          <Kbd>↵</Kbd>
        </Demo>
      </div>
    </Section>
  );
}
