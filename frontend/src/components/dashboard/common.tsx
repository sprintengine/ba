"use client";

import { useMemo } from "react";
import { Box, DoorOpen, Lock, User, type LucideIcon } from "lucide-react";
import type { ResourceKind } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import {
  DEFAULT_LOCALE,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPrice,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  type DateStyle,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

/** Formatting bound to the current business (timezone, locale, currency). */
export function useFmt() {
  const b = useCurrentBusiness();
  return useMemo(() => {
    const tz = b.timezone;
    const locale = b.locale || DEFAULT_LOCALE;
    return {
      tz,
      locale,
      currency: b.currency,
      time: (iso: string) => formatTime(iso, tz, locale),
      range: (start: string, end: string) => formatTimeRange(start, end, tz, locale),
      date: (value: string, style: DateStyle = "medium") => formatDate(value, tz, style, locale),
      dateTime: (iso: string) => formatDateTime(iso, tz, locale),
      relDay: (value: string) => formatRelativeDay(value, tz, locale),
      /** `currency`: the amount's own (a booking's or payment's); the business's by default. */
      money: (cents: number, opts?: { exact?: boolean; signed?: boolean; currency?: string }) =>
        formatMoney(cents, opts?.currency ?? b.currency, { locale, ...opts }),
      /** `currency`: the price's own (a booking's); the business's by default. */
      price: (cents: number, currency?: string) => formatPrice(cents, currency ?? b.currency, { locale }),
      duration: formatDuration,
    };
  }, [b.timezone, b.locale, b.currency]);
}

export const KIND_ICON: Record<ResourceKind, LucideIcon> = { person: User, space: DoorOpen, equipment: Box };

export function ResourceKindIcon({ kind, className }: { kind: ResourceKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon aria-hidden className={cn("size-3.5 shrink-0", className)} />;
}

/** Small colour swatch (service/resource colour). Decorative. */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset", className)}
      style={{ backgroundColor: color }}
    />
  );
}

/** A labelled block inside panels. */
export function PanelSection({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Marks sensitive data (health details etc.). */
export function SensitiveMark({ className }: { className?: string }) {
  return (
    <Tooltip content="Sensitive: never emailed or shared with AI">
      <span
        className={cn(
          "inline-flex h-5 items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-1.5 text-2xs font-medium text-warning-soft-foreground",
          className,
        )}
      >
        <Lock className="size-3" aria-hidden />
        Sensitive
      </span>
    </Tooltip>
  );
}
