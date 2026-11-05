"use client";

import type { Booking } from "@/lib/api/types";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ColorDot, useFmt } from "../common";

/** A free booking has nothing to say about payment: the price already reads "Free". */
function BookingPayment({ booking: b, className }: { booking: Booking; className?: string }) {
  if (b.priceCents === 0 && b.paymentStatus === "not_required") return null;
  return <PaymentStatusBadge status={b.paymentStatus} className={className} />;
}

/**
 * A booking in the desktop table; Enter/Space or a click opens it. Who it is with has its own column from xl and sits
 * under the service below that; the reference shows only from 2xl, so the table fits its box at 1440px.
 */
export function BookingRow({ booking: b, onOpen }: { booking: Booking; onOpen: () => void }) {
  const fmt = useFmt();
  return (
    <TableRow data-booking-row="" onActivate={onOpen}>
      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{fmt.relDay(b.start)}</span>
          <span className="tnum text-xs text-muted-foreground">{fmt.range(b.start, b.end)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
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
      <TableCell>
        <span className="flex min-w-0 items-center gap-2">
          <ColorDot color={b.service.color} />
          <span className="flex min-w-0 flex-col">
            <span className="max-w-56 truncate">
              {b.service.name}
              {b.option && <span className="text-muted-foreground"> · {b.option.name}</span>}
            </span>
            {b.resources.length > 0 && (
              <span className="max-w-56 truncate text-xs text-muted-foreground xl:hidden">
                {b.resources.map((r) => r.name).join(", ")}
              </span>
            )}
          </span>
        </span>
      </TableCell>
      <TableCell
        className="hidden max-w-40 truncate text-muted-foreground xl:table-cell"
        // The whole list on hover when it's cut short.
        title={b.resources.map((r) => r.name).join(", ") || undefined}
      >
        {b.resources.map((r) => r.name).join(", ") || "—"}
      </TableCell>
      <TableCell>
        <BookingStatusBadge status={b.status} />
      </TableCell>
      <TableCell>
        <BookingPayment booking={b} />
      </TableCell>
      <TableCell align="right" className="whitespace-nowrap">
        {fmt.price(b.priceCents, b.currency)}
      </TableCell>
      <TableCell className="hidden font-mono text-xs whitespace-nowrap text-subtle-foreground 2xl:table-cell">
        {b.reference}
      </TableCell>
    </TableRow>
  );
}

/** A booking in the mobile list. */
export function MobileRow({ booking: b, onOpen }: { booking: Booking; onOpen: () => void }) {
  const fmt = useFmt();
  return (
    <li>
      <button
        type="button"
        data-booking-row=""
        onClick={onOpen}
        className="flex w-full items-center gap-3 p-3.5 text-left active:bg-accent"
      >
        <Avatar name={b.customer.name} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{b.customer.name}</span>
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {fmt.relDay(b.start)}, {fmt.time(b.start)}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {[b.service.name, ...b.resources.map((r) => r.name)].join(" · ")}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {/* From iPad portrait up there is room for the payment too. */}
              <BookingPayment booking={b} className="hidden sm:inline-flex" />
              <BookingStatusBadge status={b.status} />
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
      <TableCell>
        <Skeleton className="h-5 w-16 rounded-full" />
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
