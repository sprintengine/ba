"use client";

import { ChevronRight } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { BOOKING_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingExceptions } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ColorDot, useFmt } from "../common";
import type { BookingDay } from "./group-bookings";

/** A list's day heading: the day, then how much is on it. */
function dayLine(day: BookingDay, fmt: ReturnType<typeof useFmt>, noun: string) {
  return `${String(day.count)} ${noun}${day.cents > 0 ? ` · ${fmt.price(day.cents, day.first.currency)}` : ""}`;
}

/** The day's heading in the table, stuck under the column heads as its bookings scroll. */
export function DayRow({ day }: { day: BookingDay }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  return (
    <tr className="border-b border-border">
      <th
        colSpan={8}
        scope="colgroup"
        className="sticky top-9 z-[5] bg-background px-4 pt-5 pb-2 text-left text-sm font-semibold"
      >
        {fmt.relDay(day.first.start)}
        <span className="tnum ml-2 font-normal text-muted-foreground">
          {dayLine(day, fmt, v("booking", { count: day.count }))}
        </span>
      </th>
    </tr>
  );
}

/** The day's heading in the phone list. */
export function MobileDayHeading({ day }: { day: BookingDay }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  return (
    <li className="sticky top-14 z-[5] bg-background px-3.5 pt-5 pb-2 text-sm font-semibold sm:top-0">
      {fmt.relDay(day.first.start)}
      <span className="tnum ml-2 font-normal text-muted-foreground">
        {dayLine(day, fmt, v("booking", { count: day.count }))}
      </span>
    </li>
  );
}

const withWhom = (b: Booking) => b.resources.map((r) => r.name).join(", ");

function ServiceCell({ booking: b }: { booking: Booking }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ColorDot color={b.service.color} />
      <span className="flex min-w-0 flex-col">
        <span className="max-w-56 truncate">
          {b.service.name}
          {b.option && <span className="text-muted-foreground"> · {b.option.name}</span>}
        </span>
        {b.resources.length > 0 && (
          <span className="max-w-56 truncate text-xs text-muted-foreground xl:hidden">{withWhom(b)}</span>
        )}
      </span>
    </span>
  );
}

/**
 * A booking in the desktop table; Enter/Space or a click opens it. Its day is the heading above it, and only what's
 * out of the ordinary shows. Who it is with has its own column from xl and sits under the service below that; the
 * reference shows only from 2xl, so the table fits its box at 1440px.
 */
export function BookingRow({
  booking: b,
  onOpen,
  nested,
}: {
  booking: Booking;
  onOpen: () => void;
  /** One person in a class that's open: the class's row already says when and what. */
  nested?: boolean;
}) {
  const fmt = useFmt();
  return (
    <TableRow data-booking-row="" onActivate={onOpen}>
      <TableCell className="tnum whitespace-nowrap">{nested ? null : fmt.range(b.start, b.end)}</TableCell>
      <TableCell>
        <div className={cn("flex min-w-0 items-center gap-2.5", nested && "pl-6")}>
          <Avatar name={b.customer.name} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{b.customer.name}</span>
            {(b.customer.email || b.customer.phone) && (
              <span className="max-w-52 truncate text-xs text-muted-foreground">
                {b.customer.email ?? b.customer.phone}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>{!nested && <ServiceCell booking={b} />}</TableCell>
      <TableCell
        className="hidden max-w-40 truncate text-muted-foreground xl:table-cell"
        // The whole list on hover when it's cut short.
        title={withWhom(b) || undefined}
      >
        {nested ? null : withWhom(b) || "—"}
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          <BookingExceptions status={b.status} payment={b.paymentStatus} />
        </span>
      </TableCell>
      <TableCell align="right" className="tnum whitespace-nowrap">
        {fmt.price(b.priceCents, b.currency)}
      </TableCell>
      <TableCell className="hidden font-mono text-xs whitespace-nowrap text-subtle-foreground 2xl:table-cell">
        {b.reference}
      </TableCell>
    </TableRow>
  );
}

/** What a class's row says about the people in it: only the ones who are out of the ordinary. */
function ClassExceptions({ bookings }: { bookings: Booking[] }) {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === "confirmed" || b.status === "completed") continue;
    const label = BOOKING_STATUS[b.status].label.toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, n]) => <Badge key={label}>{`${String(n)} ${label}`}</Badge>);
}

/** Everyone in one class, as one row that opens to show them. */
export function ClassRow({
  bookings,
  open,
  onToggle,
}: {
  bookings: [Booking, ...Booking[]];
  open: boolean;
  onToggle: () => void;
}) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  const [b] = bookings;
  const total = bookings.reduce((n, x) => n + (x.status === "cancelled" ? 0 : x.priceCents), 0);
  return (
    <TableRow aria-expanded={open} onActivate={onToggle}>
      <TableCell className="tnum whitespace-nowrap">{fmt.range(b.start, b.end)}</TableCell>
      <TableCell>
        <span className="flex items-center gap-2.5 font-medium">
          <ChevronRight
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          {`${String(bookings.length)} ${v("customers")}`}
        </span>
      </TableCell>
      <TableCell>
        <ServiceCell booking={b} />
      </TableCell>
      <TableCell className="hidden max-w-40 truncate text-muted-foreground xl:table-cell">
        {withWhom(b) || "—"}
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          <ClassExceptions bookings={bookings} />
        </span>
      </TableCell>
      <TableCell align="right" className="tnum whitespace-nowrap">
        {fmt.price(total, b.currency)}
      </TableCell>
      <TableCell className="hidden 2xl:table-cell" />
    </TableRow>
  );
}

/** A booking in the mobile list: who and when, what and with whom, and the money, which a phone needs just as much. */
export function MobileRow({
  booking: b,
  onOpen,
  nested,
}: {
  booking: Booking;
  onOpen: () => void;
  nested?: boolean;
}) {
  const fmt = useFmt();
  return (
    <li>
      <button
        type="button"
        data-booking-row=""
        onClick={onOpen}
        className={cn("flex w-full items-center gap-3 p-3.5 text-left active:bg-accent", nested && "pl-8")}
      >
        <span className="tnum w-11 shrink-0 text-sm font-medium">{fmt.time(b.start)}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{b.customer.name}</span>
            <span className="tnum shrink-0 text-sm">{fmt.price(b.priceCents, b.currency)}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {[b.service.name, ...b.resources.map((r) => r.name)].join(" · ")}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <BookingExceptions status={b.status} payment={b.paymentStatus} />
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** Everyone in one class on a phone: one row that opens to show them. */
export function MobileClassRow({
  bookings,
  open,
  onToggle,
}: {
  bookings: [Booking, ...Booking[]];
  open: boolean;
  onToggle: () => void;
}) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  const [b] = bookings;
  const total = bookings.reduce((n, x) => n + (x.status === "cancelled" ? 0 : x.priceCents), 0);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3.5 text-left active:bg-accent"
      >
        <span className="tnum w-11 shrink-0 text-sm font-medium">{fmt.time(b.start)}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
              <span className="truncate">{`${b.service.name}, ${String(bookings.length)} ${v("customers")}`}</span>
              <ChevronRight
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
            </span>
            <span className="tnum shrink-0 text-sm">{fmt.price(total, b.currency)}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{withWhom(b)}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <ClassExceptions bookings={bookings} />
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** Placeholder table row while the first page loads. */
export function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-36" />
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-20 rounded-full" />
      </TableCell>
      <TableCell align="right">
        <Skeleton className="ml-auto h-4 w-12" />
      </TableCell>
      <TableCell className="hidden 2xl:table-cell">
        <Skeleton className="h-4 w-20" />
      </TableCell>
    </TableRow>
  );
}

/** Placeholder mobile row while the first page loads. */
export function MobileSkeletonRow() {
  return (
    <li className="flex items-center gap-3 p-3.5">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </li>
  );
}
