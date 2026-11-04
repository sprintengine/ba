"use client";

import { CreditCard, Lock, Shield } from "lucide-react";
import { bookingEnd } from "@/lib/booking/booking";
import { cancellationSummary } from "@/lib/booking/copy";
import {
  formatDate,
  formatDuration,
  formatPrice,
  formatTimeRange,
  zonedToIso,
  type PlainDate,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { LUMEN, LUMEN_POLICIES } from "./fixture";
import type { Details } from "./state";

/* The last step, as components/booking/review-step.tsx renders it: when, what, who, and the payment. */

const TZ = LUMEN.timezone;
const MINUTES = 60;
export const PRICE = formatPrice(7000, LUMEN.currency, { locale: LUMEN.locale });

function Section({
  title,
  edit = true,
  children,
}: {
  title: string;
  edit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-xs dark:bg-surface-raised">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-subtle-foreground">{title}</h3>
        {edit && <span className="rounded text-xs font-medium text-brand underline-offset-4">Change</span>}
      </div>
      {children}
    </section>
  );
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {label}
        <Badge tone="neutral" className="h-4.5 px-1.5 text-2xs">
          <Lock /> Private
        </Badge>
      </dt>
      <dd className="break-words whitespace-pre-line">{value}</dd>
    </div>
  );
}

export function ReviewStep({ date, time, details }: { date: PlainDate; time: string; details: Details }) {
  const start = zonedToIso(date, time, TZ);
  return (
    <div className="flex flex-col gap-5">
      <Section title="When">
        <p className="text-base font-semibold tracking-tight">{formatDate(date, TZ, "full", LUMEN.locale)}</p>
        <p className="tnum text-sm text-muted-foreground">
          {formatTimeRange(start, bookingEnd(start, MINUTES), TZ, LUMEN.locale)} · {formatDuration(MINUTES)}
        </p>
      </Section>
      <Section title="What">
        <p className="font-medium">Initial assessment</p>
        <p className="text-sm text-muted-foreground">With Sam Rivers</p>
      </Section>
      <Section title="Your details">
        <p className="font-medium">{details.name}</p>
        <p className="text-sm text-muted-foreground">{[details.email, details.phone].join(" · ")}</p>
        <dl className="mt-3 flex flex-col gap-2.5 border-t border-border-subtle pt-3 text-sm">
          <Answer label="What would you like help with?" value={details.help} />
          <Answer
            label="Have you had surgery on this area in the last 12 months?"
            value={details.surgery ?? ""}
          />
        </dl>
      </Section>
      <Section title="Payment" edit={false}>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Initial assessment</dt>
            <dd className="tnum">{PRICE}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-3 border-t border-border-subtle pt-2">
            <dt className="font-medium">Total</dt>
            <dd className="font-semibold">
              <span className="tnum">{PRICE}</span>
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3 text-sm text-muted-foreground">
          <p className="flex gap-2">
            <CreditCard className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
            Paid securely online when you book.
          </p>
          <p className="flex gap-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
            {cancellationSummary(LUMEN_POLICIES, "full", LUMEN.name)}
          </p>
        </div>
      </Section>
      <p className="text-xs text-muted-foreground">
        Your details are shared with {LUMEN.name} to manage your appointment. See our{" "}
        <span className="underline underline-offset-2">privacy notice</span>.
      </p>
    </div>
  );
}
