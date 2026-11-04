"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/color-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { TimeInput } from "@/components/ui/time-input";
import { Section, TZ } from "./section";

export function PickersSection() {
  const [date, setDate] = useState<string | null>("2026-10-14");
  const [date2, setDate2] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>("09:30");
  const [price, setPrice] = useState<number | null>(6500);
  const [color, setColor] = useState("#0e7c70");
  return (
    <Section
      id="pickers"
      title="Date, time, money, colour"
      description="Calendar works on plain dates (YYYY-MM-DD). MoneyInput speaks cents."
    >
      <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
        <Card className="w-fit p-4">
          <Calendar
            value={date}
            onValueChange={setDate}
            defaultMonth="2026-10"
            min="2026-10-02"
            isDateDisabled={(d) => d.endsWith("-11") || d.endsWith("-18") || d.endsWith("-25")}
            hasMarker={(d) => Number(d.slice(8)) % 3 !== 0}
            timeZone={TZ}
          />
        </Card>
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date" help={date ? `Selected ${date}` : undefined}>
              <DatePicker value={date2} onValueChange={setDate2} timeZone={TZ} />
            </Field>
            <Field label="Start time" help="Type 9, 930 or 2pm; ↑/↓ steps 15 min.">
              <TimeInput value={time} onValueChange={setTime} />
            </Field>
          </div>
          <Field
            label="Price"
            help={price !== null ? `${price} cents → ${formatPrice(price, "EUR")}` : "Empty"}
          >
            <MoneyInput currency="EUR" value={price} onValueChange={setPrice} className="max-w-40" />
          </Field>
          <Field label="Brand colour">
            <ColorPicker value={color} onValueChange={setColor} />
          </Field>
        </div>
      </div>
    </Section>
  );
}
