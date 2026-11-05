"use client";

import type { ReportSummary } from "@/lib/api/types";
import { useVocabulary } from "@/lib/vocabulary";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFmt } from "../common";

/** Bookings and revenue per day as a table (the chart's accessible alternative). */
export function DayTable({ data }: { data: ReportSummary }) {
  const fmt = useFmt();
  const { v } = useVocabulary();
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 bg-surface-sunken">
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead align="right">{v("bookings", { title: true })}</TableHead>
            <TableHead align="right">Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Newest first: what just happened is what people come here for. */}
          {data.byDay.toReversed().map((d) => (
            <TableRow key={d.date}>
              <TableCell className="h-9">{fmt.date(d.date, "dayMonthYear")}</TableCell>
              <TableCell align="right" className="h-9">
                {d.bookings}
              </TableCell>
              <TableCell align="right" className="h-9">
                {fmt.money(d.revenueCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
