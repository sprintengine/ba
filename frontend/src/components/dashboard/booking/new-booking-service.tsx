"use client";

import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import type { Service } from "@/lib/api/types";
import { defaultPaymentMode, type NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { formatDuration } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorDot, useFmt } from "../common";

/** Step 1: the service (grouped by category), then its option and add-ons. Changing any of them clears the time. */
export function ServiceFields({ services, service }: { services: Service[]; service: Service | undefined }) {
  const fmt = useFmt();
  const form = useFormContext<Values>();
  const byCategory = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      const key = s.category?.trim() || "Services";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [services]);

  return (
    <>
      <FormField<Values, "serviceId"> name="serviceId" label="Service" required>
        {(field) => (
          <Select
            // "" (not undefined) shows the placeholder and keeps the Select controlled from the start.
            value={field.value}
            onValueChange={(id) => {
              field.onChange(id);
              const s = services.find((x) => x.id === id);
              form.setValue("optionId", s?.options.length === 1 ? (s.options[0]?.id ?? null) : null);
              form.setValue("addonIds", []);
              form.setValue("slotStart", null);
              form.setValue("paymentMode", defaultPaymentMode(s));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a service" />
            </SelectTrigger>
            <SelectContent>
              {byCategory.map(([cat, list]) => (
                <SelectGroup key={cat}>
                  {byCategory.length > 1 && <SelectLabel>{cat}</SelectLabel>}
                  {list.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={s.color} />
                        {s.name}
                        <span className="text-subtle-foreground">
                          {formatDuration(s.durationMinutes)}
                          {!s.isPublic ? " · private" : ""}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {service && service.options.length > 0 && (
        <FormField<Values, "optionId"> name="optionId" label="Option" required>
          {(field) => (
            <RadioCards
              value={field.value ?? ""}
              onValueChange={(id) => {
                field.onChange(id);
                form.setValue("slotStart", null);
              }}
              columns={2}
            >
              {service.options.map((o) => (
                <RadioCard
                  key={o.id}
                  value={o.id}
                  title={o.name}
                  description={formatDuration(o.durationMinutes)}
                  aside={fmt.price(o.priceCents)}
                  className="p-3"
                />
              ))}
            </RadioCards>
          )}
        </FormField>
      )}
      {service && service.addons.length > 0 && (
        <FormField<Values, "addonIds"> name="addonIds" label="Add-ons" optional>
          {(field) => (
            <div className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border">
              {service.addons.map((a) => {
                const checked = field.value.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-sm hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        field.onChange(c ? [...field.value, a.id] : field.value.filter((x) => x !== a.id));
                        form.setValue("slotStart", null);
                      }}
                    />
                    <span className="flex-1">
                      {a.name}
                      {a.extraMinutes ? (
                        <span className="text-subtle-foreground"> · +{formatDuration(a.extraMinutes)}</span>
                      ) : null}
                    </span>
                    <span className="tnum text-muted-foreground">
                      {a.priceCents ? fmt.money(a.priceCents, { signed: true }) : "Free"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </FormField>
      )}
    </>
  );
}
