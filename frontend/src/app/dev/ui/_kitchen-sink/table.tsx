"use client";

import { useState } from "react";
import { CalendarDays, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatMoney, formatTimeRange } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  type SortDirection,
} from "@/components/ui/table";
import { Section, TZ } from "./section";

const ROWS = [
  {
    ref: "BA-7K3F9Q",
    customer: "Alex Morgan",
    service: "Initial assessment",
    start: "2026-10-01T09:00:00+01:00",
    end: "2026-10-01T10:00:00+01:00",
    status: "confirmed" as const,
    pay: "paid" as const,
    price: 6500,
  },
  {
    ref: "BA-2M8Q1X",
    customer: "Jordan Casey",
    service: "Follow-up",
    start: "2026-10-01T10:15:00+01:00",
    end: "2026-10-01T11:00:00+01:00",
    status: "pending_approval" as const,
    pay: "pending" as const,
    price: 4500,
  },
  {
    ref: "BA-9TT4ZB",
    customer: "Sam Taylor",
    service: "Sports massage",
    start: "2026-10-01T11:30:00+01:00",
    end: "2026-10-01T12:30:00+01:00",
    status: "cancelled" as const,
    pay: "refunded" as const,
    price: 7000,
  },
  {
    ref: "BA-5PQ7RD",
    customer: "Taylor Reed",
    service: "Follow-up",
    start: "2026-10-01T14:00:00+01:00",
    end: "2026-10-01T14:45:00+01:00",
    status: "no_show" as const,
    pay: "pay_at_venue" as const,
    price: 4500,
  },
];

export function TableSection() {
  const [sort, setSort] = useState<{ key: "customer" | "price"; dir: SortDirection }>({
    key: "customer",
    dir: "asc",
  });
  const rows = [...ROWS].sort((a, b) => {
    const cmp = sort.key === "price" ? a.price - b.price : a.customer.localeCompare(b.customer);
    return sort.dir === "desc" ? -cmp : cmp;
  });
  const toggle = (key: "customer" | "price") =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  return (
    <Section
      id="table"
      title="Table"
      description="Sortable headers, right-aligned numbers, interactive rows."
    >
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead sort={sort.key === "customer" ? sort.dir : false} onSort={() => toggle("customer")}>
                Customer
              </TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead
                align="right"
                sort={sort.key === "price" ? sort.dir : false}
                onSort={() => toggle("price")}
              >
                Price
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.ref} interactive>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.ref}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <Avatar name={r.customer} size="sm" />
                    <span className="font-medium">{r.customer}</span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.service}</TableCell>
                <TableCell className="tnum whitespace-nowrap">
                  {formatTimeRange(r.start, r.end, TZ)}
                </TableCell>
                <TableCell>
                  <BookingStatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={r.pay} />
                </TableCell>
                <TableCell align="right">{formatMoney(r.price, "EUR", { exact: true })}</TableCell>
                <TableCell>
                  <RowMenu />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Section>
  );
}

function RowMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Actions" tooltip={false} size="xs">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CalendarDays /> Reschedule
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive>
          <Trash2 /> Cancel booking
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
