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

/** Everything about a booking, top to bottom: status notes, customer, service, payment, answers, notes, history. */
export function BookingDetailBody({ booking: b }: { booking: BookingDetail }) {
  return (
    <div className="flex flex-col gap-7">
      <StatusCallouts booking={b} />
      <CustomerSection booking={b} />
      <ServiceSection booking={b} />
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
        <Callout tone="info" icon={<CalendarClock />}>
          This {v("booking")} needs your approval. The {v("customer")} is told once you approve or decline.
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

/** Name, group, and how to reach them; links to their profile. */
function CustomerSection({ booking: b }: { booking: BookingDetail }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const groups = useCustomerGroups(business.id);
  const group = groups.data?.find((g) => g.id === (b.groupId ?? b.customer.groupId));
  return (
    <PanelSection
      title={v("customer", { title: true })}
      action={
        <Button asChild variant="link" size="xs" className="text-xs">
          <Link href={`/dashboard/${business.slug}/customers/${b.customer.id}`}>View profile</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5 text-sm">
        {group && (
          <Badge tone="brand" className="w-fit">
            {group.name}
          </Badge>
        )}
        {b.customer.email && (
          <a
            href={`mailto:${b.customer.email}`}
            className="flex w-fit items-center gap-2 text-muted-foreground hover:text-foreground pointer-coarse:min-h-11"
          >
            <Mail className="size-3.5" aria-hidden /> {b.customer.email}
          </a>
        )}
        {b.customer.phone && (
          <a
            href={`tel:${b.customer.phone}`}
            className="tnum flex w-fit items-center gap-2 text-muted-foreground hover:text-foreground pointer-coarse:min-h-11"
          >
            <Phone className="size-3.5" aria-hidden /> {b.customer.phone}
          </a>
        )}
        {!b.customer.email && !b.customer.phone && (
          <span className="text-muted-foreground">No contact details</span>
        )}
      </div>
    </PanelSection>
  );
}

/** Service and option, length, add-ons, resources, buffers, and where it was booked. */
function ServiceSection({ booking: b }: { booking: BookingDetail }) {
  const fmt = useFmt();
  return (
    <PanelSection title="Service">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 text-sm dark:bg-surface-raised">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ColorDot color={b.service.color} />
            <span className="truncate font-medium">
              {b.service.name}
              {b.option && <span className="font-normal text-muted-foreground"> · {b.option.name}</span>}
            </span>
          </div>
          <span className="tnum shrink-0 text-muted-foreground">{formatDuration(bookingMinutes(b))}</span>
        </div>
        {b.addons.length > 0 && (
          <ul className="flex flex-col gap-1 border-t border-border-subtle pt-2.5">
            {b.addons.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 text-muted-foreground">
                <span>
                  + {a.name}
                  {a.extraMinutes ? ` (${formatDuration(a.extraMinutes)})` : ""}
                </span>
                <span className="tnum">{a.priceCents ? fmt.money(a.priceCents, { signed: true }) : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {b.resources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-2.5">
            {b.resources.map((r) => (
              <span
                key={r.id}
                className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs text-muted-foreground"
              >
                <ResourceKindIcon kind={r.kind} />
                {r.name}
              </span>
            ))}
          </div>
        )}
        <Buffers before={b.bufferBeforeMinutes} after={b.bufferAfterMinutes} />
      </div>
      <p className="text-xs text-subtle-foreground">
        Booked via {SOURCE_LABEL[b.source].toLowerCase()} on {fmt.dateTime(b.createdAt)}
      </p>
    </PanelSection>
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
