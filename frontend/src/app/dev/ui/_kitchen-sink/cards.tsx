"use client";

import { CalendarDays, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatCard } from "@/components/ui/stat";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { Section } from "./section";

export function CardsSection() {
  return (
    <Section id="cards" title="Cards, stats, avatars">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Bookings (30 days)"
          value="128"
          delta={{ value: "12%", trend: "up" }}
          hint="vs previous 30 days"
          icon={<CalendarDays />}
        />
        <StatCard
          label="Revenue"
          value={<span className="tnum">{formatMoney(482000, "EUR")}</span>}
          delta={{ value: "4%", trend: "down" }}
          icon={<TrendingUp />}
        />
        <StatCard
          label="No-shows"
          value="3"
          delta={{ value: "2", trend: "down", positiveIsGood: false }}
          hint="Lower is better"
        />
        <StatCard label="Loading" value="" loading />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>6 appointments · 2 need approval</CardDescription>
            <CardAction>
              <Button variant="secondary" size="sm">
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {[
              { t: "09:00", n: "Alex Morgan", s: "Initial assessment", st: "confirmed" as const },
              { t: "10:15", n: "Jordan Casey", s: "Follow-up", st: "pending_approval" as const },
              { t: "11:00", n: "Sam Taylor", s: "Sports massage", st: "held" as const },
            ].map((b) => (
              <div
                key={b.t}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/60"
              >
                <span className="tnum w-11 text-sm font-medium">{b.t}</span>
                <Avatar name={b.n} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{b.n}</span>
                  <span className="truncate text-xs text-muted-foreground">{b.s}</span>
                </span>
                <BookingStatusBadge status={b.st} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card interactive>
          <CardHeader>
            <CardTitle>Interactive card</CardTitle>
            <CardDescription>Hover me — lifts subtly.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name="Alex Morgan" size="xs" />
              <Avatar name="Jordan Casey" size="sm" />
              <Avatar name="Sam Taylor" size="md" />
              <Avatar name="Taylor Reed" size="lg" />
              <Avatar name="Lumen Physiotherapy" size="xl" shape="square" />
            </div>
            <AvatarGroup
              people={[
                { name: "Alex M" },
                { name: "Jordan C" },
                { name: "Sam T" },
                { name: "Taylor R" },
                { name: "Olive D" },
                { name: "Pádraig L" },
              ]}
            />
          </CardContent>
          <CardFooter>
            <span className="text-xs text-muted-foreground">Card footer</span>
            <Button variant="ghost" size="xs" className="ml-auto">
              Details
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scroll area</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40 rounded-lg border border-border">
              <div className="flex flex-col p-3">
                {Array.from({ length: 16 }, (_, i) => (
                  <div
                    key={i}
                    className="flex justify-between border-b border-border-subtle py-1.5 text-sm last:border-0"
                  >
                    <span>Slot {i + 1}</span>
                    <span className="tnum text-muted-foreground">{`${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
