import {
  ArrowRight,
  CalendarPlus,
  CalendarRange,
  Copy,
  Euro,
  ExternalLink,
  Globe,
  Inbox,
  TrendingUp,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat";

const TODAY = [
  {
    time: "09:30",
    name: "Toby Marsh",
    detail: "Follow-up treatment · Sam Rivers, Treatment room 1",
    color: "#a99bff",
  },
  {
    time: "10:00",
    name: "Avery Lane",
    detail: "Initial assessment · Casey Lane, Treatment room 2",
    color: "#5b4ae0",
  },
  {
    time: "11:30",
    name: "Casey Rowe",
    detail: "Initial assessment · Sam Rivers, Treatment room 2",
    color: "#5b4ae0",
  },
  {
    time: "14:00",
    name: "Remy Stroud",
    detail: "Sports massage · Sam Rivers, Treatment room 1",
    color: "#0ea5e9",
  },
] as const;

/** Overview: greeting, the four KPIs, today's list and the booking page card. */
export function OverviewScreen() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col">
      <header className="flex items-end justify-between gap-4 pb-6">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tracking-tight">Good morning, Avery</p>
          <p className="text-sm text-muted-foreground">Thursday, 1 October · 4 appointments today</p>
        </div>
        <div className="flex gap-2">
          <Button tabIndex={-1}>
            <CalendarRange /> Calendar
          </Button>
          <Button tabIndex={-1} variant="primary">
            <CalendarPlus /> New appointment
          </Button>
        </div>
      </header>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Today" value="4" icon={<CalendarRange />} hint="Next at 09:30" />
          <StatCard label="Next 7 days" value="18" icon={<TrendingUp />} hint="Upcoming appointments" />
          <StatCard
            label="Appointments (30 days)"
            value="109"
            icon={<Inbox />}
            hint="Created in the last 30 days"
          />
          <StatCard
            label="Revenue (30 days)"
            value="€5,470"
            icon={<Euro />}
            hint="Payments received, after refunds"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle headingLevel={2}>Today&apos;s appointments</CardTitle>
              <span className="flex items-center gap-1 text-sm font-medium">
                Open calendar <ArrowRight className="size-4" />
              </span>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ol className="flex flex-col">
                {TODAY.map((b) => (
                  <li key={b.time} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <span className="tnum w-12 shrink-0 text-sm font-medium">{b.time}</span>
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <Avatar name={b.name} size="md" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{b.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{b.detail}</span>
                    </span>
                    <BookingStatusBadge status="confirmed" />
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle headingLevel={2} className="flex items-center gap-2">
                Your booking page
                <Badge tone="success" dot>
                  Live
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Add the link to your website, Instagram or Google profile.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-sunken py-1 pr-1 pl-3">
                <Globe className="size-4 shrink-0 text-subtle-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  bookanything.ie/lumen-physio
                </span>
                <span className="flex size-7 items-center justify-center text-muted-foreground">
                  <Copy className="size-4" />
                </span>
                <span className="flex size-7 items-center justify-center text-muted-foreground">
                  <ExternalLink className="size-4" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
