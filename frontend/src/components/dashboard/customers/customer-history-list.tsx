"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { CustomerDetail } from "@/lib/api/types";
import { BookingExceptions } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColorDot, useFmt } from "../common";

/** A customer's booking history; selecting one opens it. */
type HistoryProps = { bookings: CustomerDetail["bookings"]; onOpen: (id: string) => void };
type Booked = CustomerDetail["bookings"][number];

/** What's ahead, then what's been, each under its own heading; a history with only one of them needs none. */
function historyGroups(bookings: readonly Booked[], now: number) {
  const coming = bookings.filter((b) => new Date(b.end).getTime() >= now);
  const past = bookings.filter((b) => new Date(b.end).getTime() < now);
  const titled = coming.length > 0 && past.length > 0;
  return [
    { title: titled ? "Upcoming" : null, items: coming },
    { title: titled ? "Past" : null, items: past },
  ].filter((g) => g.items.length > 0);
}

/** Wider screens: the history as a table whose rows open the booking (click, or Tab then Enter/Space). */
export function HistoryTable({ bookings, onOpen }: HistoryProps) {
  const fmt = useFmt();
  const [now] = useState(Date.now);
  return (
    <div className="border-t border-border-subtle">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Service</TableHead>
            <TableHead align="right">Price</TableHead>
          </TableRow>
        </TableHeader>
        {historyGroups(bookings, now).map((group) => (
          <TableBody key={group.title ?? "all"}>
            {group.title && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="pt-4 pb-1.5 text-xs font-semibold text-foreground">
                  {group.title}
                </TableCell>
              </TableRow>
            )}
            {group.items.map((b) => (
              <TableRow key={b.id} onActivate={() => onOpen(b.id)}>
                <TableCell className="whitespace-nowrap">
                  <span className="flex flex-col">
                    <span className="font-medium">{fmt.day(b.start)}</span>
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
                    <BookingExceptions status={b.status} />
                  </span>
                </TableCell>
                <TableCell align="right">{fmt.price(b.priceCents, b.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        ))}
      </Table>
    </div>
  );
}

/** Phones: the history as a list of tappable rows (the table needs more width than a phone has). */
export function HistoryList({ bookings, onOpen }: HistoryProps) {
  const fmt = useFmt();
  const [now] = useState(Date.now);
  const rows = historyGroups(bookings, now).flatMap((g) => [
    ...(g.title ? [{ heading: g.title }] : []),
    ...g.items.map((b) => ({ booking: b })),
  ]);
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {rows.map((row) => {
        if ("heading" in row)
          return (
            <li key={row.heading} className="px-5 pt-3.5 pb-1.5 text-xs font-semibold">
              {row.heading}
            </li>
          );
        const b = row.booking;
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onOpen(b.id)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-accent"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="tnum text-sm font-medium">
                  {fmt.day(b.start)} · <span className="whitespace-nowrap">{fmt.range(b.start, b.end)}</span>
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
                <BookingExceptions status={b.status} />
                <span className="tnum text-xs text-muted-foreground">
                  {fmt.price(b.priceCents, b.currency)}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
