"use client";

import { CalendarDays, CalendarPlus, Circle, CircleCheck, Euro, TrendingUp, Users } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { VocabularyProvider } from "@/lib/vocabulary";
import { DashboardShell } from "@/components/shells/dashboard-shell";
import { PageContainer } from "@/components/ui/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { MOCK_MEMBERSHIP, MOCK_MEMBERSHIPS } from "../mocks";

const SETUP_STEPS: [string, boolean][] = [
  ["Services", true],
  ["Therapists", true],
  ["Availability", true],
  ["Payments", false],
  ["Branding", false],
  ["Publish", false],
];

/** DashboardShell preview with mock data (no backend needed). */
export default function DashboardShellPreview() {
  const m = MOCK_MEMBERSHIP;
  return (
    <VocabularyProvider
      vocabulary={{
        resource: "therapist",
        resources: "therapists",
        customer: "patient",
        customers: "patients",
        booking: "appointment",
        bookings: "appointments",
      }}
    >
      <DashboardShell
        business={{ slug: m.slug, name: m.name, branding: m.branding }}
        role="owner"
        memberships={MOCK_MEMBERSHIPS}
      >
        <PageContainer>
          <PageHeader
            title="Good morning, Olive"
            description="Thursday 1 October · 6 appointments today"
            actions={
              <Button variant="primary">
                <CalendarPlus /> New appointment
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Today" value="6" icon={<CalendarDays />} hint="2 need approval" />
            <StatCard
              label="Next 7 days"
              value="41"
              icon={<TrendingUp />}
              delta={{ value: "8%", trend: "up" }}
            />
            <StatCard
              label="Revenue (30d)"
              value={formatMoney(482000, "EUR")}
              icon={<Euro />}
              delta={{ value: "4%", trend: "up" }}
            />
            <StatCard label="New patients" value="17" icon={<Users />} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Today&apos;s appointments</CardTitle>
                <CardDescription>Lumen Physiotherapy · Europe/Dublin</CardDescription>
                <CardAction>
                  <Button variant="secondary" size="sm">
                    Open calendar
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-0.5">
                {[
                  ["09:00", "Alex Morgan", "Initial assessment · Room 1", "confirmed"],
                  ["10:15", "Jordan Casey", "Follow-up · Room 2", "pending_approval"],
                  ["11:00", "Sam Taylor", "Sports massage · Room 1", "held"],
                  ["14:00", "Taylor Reed", "Follow-up · Room 2", "confirmed"],
                ].map(([t, n, s, st]) => (
                  <div
                    key={t}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent/60"
                  >
                    <span className="tnum w-11 text-sm font-medium">{t}</span>
                    <Avatar name={n} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{n}</span>
                      <span className="truncate text-xs text-muted-foreground">{s}</span>
                    </span>
                    <BookingStatusBadge status={st as "confirmed"} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Setup checklist</CardTitle>
                <CardDescription>3 of 6 done</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {SETUP_STEPS.map(([step, done]) => (
                    <li key={step} className="flex items-center gap-2.5">
                      {done ? (
                        <CircleCheck aria-hidden className="size-4 text-success" />
                      ) : (
                        <Circle aria-hidden className="size-4 text-subtle-foreground" />
                      )}
                      <span className={done ? "text-muted-foreground" : undefined}>{step}</span>
                      <span className="sr-only">{done ? "(done)" : "(to do)"}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </PageContainer>
      </DashboardShell>
    </VocabularyProvider>
  );
}
