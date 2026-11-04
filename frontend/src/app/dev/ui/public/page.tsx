"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { formatDuration, formatPrice } from "@/lib/format";
import { PublicBookingShell } from "@/components/shells/public-booking-shell";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { MOCK_PUBLIC_BUSINESS as B } from "../mocks";

/** PublicBookingShell preview with mock data (no backend needed). */
export default function PublicShellPreview() {
  const [service, setService] = useState("lesson-45");
  const [date, setDate] = useState<string | null>("2026-10-08");
  const [slot, setSlot] = useState("16:30");
  return (
    <PublicBookingShell
      business={B}
      headerAction={
        <Button variant="ghost" size="sm">
          Sign in
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Book a lesson</h1>
          <p className="text-muted-foreground">{B.description}</p>
        </div>
        <RadioCards value={service} onValueChange={setService} aria-label="Lesson">
          {[
            ["trial", "Trial lesson", 30, 0, "For new students — meet your teacher."],
            ["lesson-30", "Lesson", 30, 2500, "Piano, guitar or voice."],
            ["lesson-45", "Lesson", 45, 3500, "Our most popular length."],
          ].map(([v, name, mins, price, desc]) => (
            <RadioCard
              key={v as string}
              value={v as string}
              title={name as string}
              description={
                <span className="flex flex-col gap-1">
                  <span>{desc as string}</span>
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Clock className="size-3" /> {formatDuration(mins as number)}
                  </span>
                </span>
              }
              aside={formatPrice(price as number, "EUR")}
            />
          ))}
        </RadioCards>
        <Card className="flex-col gap-6 p-5 sm:flex-row">
          <Calendar
            size="lg"
            value={date}
            onValueChange={setDate}
            defaultMonth="2026-10"
            min="2026-10-01"
            timeZone={B.timezone}
            hasMarker={(d) => Number(d.slice(8)) % 4 !== 0}
            isDateDisabled={(d) => Number(d.slice(8)) % 7 === 4}
          />
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-sm font-medium">Thursday 8 October</p>
            <div className="grid grid-cols-3 gap-2">
              {["15:00", "15:45", "16:30", "17:15", "18:00", "18:45"].map((t) => (
                <Button
                  key={t}
                  variant={slot === t ? "primary" : "secondary"}
                  className="tnum"
                  onClick={() => setSlot(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
            <Button variant="primary" size="lg" className="mt-auto">
              Continue
            </Button>
          </div>
        </Card>
      </div>
    </PublicBookingShell>
  );
}
