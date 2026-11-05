"use client";

import type { CustomerDetail } from "@/lib/api/types";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColorDot, useFmt } from "../common";

/** A customer's booking history; selecting one opens it. */
type HistoryProps = { bookings: CustomerDetail["bookings"]; onOpen: (id: string) => void };

/** Wider screens: the history as a table whose rows open the booking (click, or Tab then Enter/Space). */
export function HistoryTable({ bookings, onOpen }: HistoryProps) {
  const fmt = useFmt();
  return (
    <div className="border-t border-border-subtle">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="right">Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id} onActivate={() => onOpen(b.id)}>
              <TableCell className="whitespace-nowrap">
                <span className="flex flex-col">
                  <span className="font-medium">{fmt.date(b.start, "dayMonthYear")}</span>
                  <span className="tnum text-xs text-muted-foreground">{fmt.range(b.start, b.end)}</span>
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <ColorDot color={b.service.color} />
                  <span className="truncate">
                    {b.service.name}
                    {b.option ? ` · ${b.option.name}` : ""}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <BookingStatusBadge status={b.status} />
              </TableCell>
              <TableCell align="right">{fmt.price(b.priceCents, b.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phones: the history as a list of tappable rows (the table needs more width than a phone has). */
export function HistoryList({ bookings, onOpen }: HistoryProps) {
  const fmt = useFmt();
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {bookings.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onOpen(b.id)}
            className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-accent"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="tnum text-sm font-medium">
                {fmt.date(b.start, "dayMonthYear")} ·{" "}
                <span className="whitespace-nowrap">{fmt.range(b.start, b.end)}</span>
              </span>
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <ColorDot color={b.service.color} />
                <span className="truncate">
                  {b.service.name}
                  {b.option ? ` · ${b.option.name}` : ""}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <BookingStatusBadge status={b.status} />
              <span className="tnum text-xs text-muted-foreground">
                {fmt.price(b.priceCents, b.currency)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
