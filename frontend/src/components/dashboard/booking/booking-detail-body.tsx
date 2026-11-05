"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Eye, EyeOff, Mail, Phone, Timer, X } from "lucide-react";
import type { BookingDetail } from "@/lib/api/types";
import { useCustomerGroups } from "@/lib/api/hooks";
import { bookingMinutes } from "@/lib/booking/booking";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ColorDot, PanelSection, ResourceKindIcon, SensitiveMark, useFmt } from "../common";
import { SOURCE_LABEL } from "@/lib/dashboard/booking-copy";
import { BookingHistory } from "./booking-history";
import { PaymentSection } from "./booking-payment";
import { Callout } from "./callout";
import { InternalNotes } from "./internal-notes";
import { PaymentLink } from "./payment-link";

/** Everything about a booking, top to bottom: status notes, the summary, payment, answers, notes, history. */
export function BookingDetailBody({ booking: b }: { booking: BookingDetail }) {
  return (
    <div className="flex flex-col gap-6">
      <StatusCallouts booking={b} />
      <Summary booking={b} />
      <PaymentSection booking={b} />
      {b.answers.length > 0 && (
        <PanelSection title="Answers">
          <dl className="flex flex-col gap-3">
            {b.answers.map((a) => (
              <Answer key={a.questionId} label={a.label} value={a.value} sensitive={a.sensitive} />
            ))}
          </dl>
        </PanelSection>
      )}
      <CustomerNote notes={b.customerNotes} />
      <InternalNotes booking={b} />
      <BookingHistory booking={b} />
    </div>
  );
}

/** Held for payment (with its link), needs approval, or cancelled (by whom, when, why). */
function StatusCallouts({ booking: b }: { booking: BookingDetail }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  return (
    <>
      {b.status === "held" && b.holdExpiresAt && (
        <Callout tone="warning" icon={<Timer />}>
          Waiting for payment. The slot is held until {fmt.time(b.holdExpiresAt)}.
        </Callout>
      )}
      {b.status === "held" && b.checkoutUrl && <PaymentLink booking={b} checkoutUrl={b.checkoutUrl} />}
      {b.status === "pending_approval" && (
        <Callout tone="warning" icon={<CalendarClock />}>
          The {v("customer")} is told once you approve or decline.
        </Callout>
      )}
      {b.status === "cancelled" && (
        <Callout tone="danger" icon={<X />}>
          Cancelled
          {b.cancelledBy ? ` by the ${b.cancelledBy === "customer" ? v("customer") : b.cancelledBy}` : ""}
          {b.cancelledAt ? ` on ${fmt.dateTime(b.cancelledAt)}` : ""}.
          {b.cancellationReason ? (
            <span className="mt-1 block text-foreground/80">“{b.cancellationReason}”</span>
          ) : null}
        </Callout>
      )}
    </>
  );
}

/** One line of the summary: a label and what it says. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-col gap-1">{children}</dd>
    </div>
  );
}

/** Who, what, with whom and how to reach them, on flat rows; then where it was booked. */
function Summary({ booking: b }: { booking: BookingDetail }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const groups = useCustomerGroups(business.id);
  const group = groups.data?.find((g) => g.id === (b.groupId ?? b.customer.groupId));
  return (
    <div className="flex flex-col gap-2">
      <dl className="-mt-2 flex flex-col divide-y divide-border-subtle border-b border-border-subtle text-sm">
        <SummaryRow label="Service">
          <span className="flex min-w-0 items-center gap-2">
            <ColorDot color={b.service.color} />
            <span className="min-w-0 truncate font-medium">
              {b.service.name}
              {b.option && <span className="font-normal text-muted-foreground"> · {b.option.name}</span>}
            </span>
            <span className="tnum ml-auto shrink-0 text-muted-foreground">
              {formatDuration(bookingMinutes(b))}
            </span>
          </span>
          <Buffers before={b.bufferBeforeMinutes} after={b.bufferAfterMinutes} />
        </SummaryRow>
        {b.addons.length > 0 && (
          <SummaryRow label="Add-ons">
            {b.addons.map((a) => (
              <span key={a.id} className="flex justify-between gap-3">
                <span>
                  {a.name}
                  {a.extraMinutes ? ` (${formatDuration(a.extraMinutes)})` : ""}
                </span>
                <span className="tnum">{a.priceCents ? fmt.money(a.priceCents, { signed: true }) : ""}</span>
              </span>
            ))}
          </SummaryRow>
        )}
        {b.resources.length > 0 && (
          <SummaryRow label="With">
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {b.resources.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5">
                  <ResourceKindIcon kind={r.kind} className="size-3.5 text-subtle-foreground" />
                  {r.name}
                </span>
              ))}
            </span>
          </SummaryRow>
        )}
        <SummaryRow label={v("customer", { title: true })}>
          {group && (
            <Badge tone="brand" className="w-fit">
              {group.name}
            </Badge>
          )}
          {b.customer.email && (
            <a
              href={`mailto:${b.customer.email}`}
              className="flex min-w-0 items-center gap-2 hover:text-muted-foreground pointer-coarse:min-h-11"
            >
              <Mail className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">{b.customer.email}</span>
            </a>
          )}
          {b.customer.phone && (
            <a
              href={`tel:${b.customer.phone}`}
              className="tnum flex w-fit items-center gap-2 hover:text-muted-foreground pointer-coarse:min-h-11"
            >
              <Phone className="size-3.5 text-subtle-foreground" aria-hidden /> {b.customer.phone}
            </a>
          )}
          {!b.customer.email && !b.customer.phone && (
            <span className="text-muted-foreground">No contact details</span>
          )}
          <Button asChild variant="link" size="xs" className="w-fit px-0 text-xs">
            <Link href={`/dashboard/${business.slug}/customers/${b.customer.id}`}>View profile</Link>
          </Button>
        </SummaryRow>
      </dl>
      <p className="text-xs text-subtle-foreground">
        Booked via {SOURCE_LABEL[b.source].toLowerCase()} on {fmt.dateTime(b.createdAt)}
      </p>
    </div>
  );
}

/** "Blocks 10 min before and 5 min after for preparation." (nothing without buffers). */
function Buffers({ before, after }: { before: number; after: number }) {
  if (before <= 0 && after <= 0) return null;
  return (
    <p className="text-xs text-subtle-foreground">
      Blocks {before > 0 ? `${before} min before` : ""}
      {before > 0 && after > 0 ? " and " : ""}
      {after > 0 ? `${after} min after` : ""} for preparation.
    </p>
  );
}

function CustomerNote({ notes }: { notes: string | null }) {
  const { v } = useVocabulary();
  if (!notes) return null;
  return (
    <PanelSection title={`Note from the ${v("customer")}`}>
      <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm whitespace-pre-wrap">{notes}</p>
    </PanelSection>
  );
}

/** One answer to a booking question; sensitive answers are hidden until shown. */
function Answer({ label, value, sensitive }: { label: string; value: string; sensitive: boolean }) {
  const [shown, setShown] = useState(!sensitive);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg text-sm",
        sensitive && "border border-warning-border/70 bg-warning-soft/40 px-3 py-2.5",
      )}
    >
      <dt className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>{label}</span>
        {sensitive && <SensitiveMark />}
      </dt>
      <dd className="flex items-start justify-between gap-2">
        {shown ? (
          <span className="whitespace-pre-wrap">
            {value || <span className="text-subtle-foreground">—</span>}
          </span>
        ) : (
          <span aria-label="Hidden" className="text-subtle-foreground select-none">
            ••••••••••
          </span>
        )}
        {sensitive && (
          <IconButton
            size="xs"
            label={shown ? "Hide answer" : "Show answer"}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOff /> : <Eye />}
          </IconButton>
        )}
      </dd>
    </div>
  );
}
