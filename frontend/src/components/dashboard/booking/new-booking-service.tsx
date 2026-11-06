"use client";

import { useMemo, useRef } from "react";
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

/** The service (grouped by category), then its option and add-ons. Changing any of them clears the time. */
export function ServiceFields({ services, service }: { services: Service[]; service: Service | undefined }) {
  const fmt = useFmt();
  const form = useFormContext<Values>();
  const trigger = useRef<HTMLButtonElement>(null);
  const byCategory = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      const key = s.category?.trim() || "Services";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [services]);

  const choose = (id: string, onChange: (id: string) => void) => {
    onChange(id);
    const s = services.find((x) => x.id === id);
    form.setValue("optionId", s?.options.length === 1 ? (s.options[0]?.id ?? null) : null);
    form.setValue("addonIds", []);
    form.setValue("slotStart", null);
    form.setValue("paymentMode", defaultPaymentMode(s));
  };

  return (
    <>
      <FormField<Values, "serviceId"> name="serviceId" label="Service" required>
        {(field) =>
          // Every choice on show until one is made, then the sheet's first line, where it can still be changed.
          field.value ? (
            <Select value={field.value} onValueChange={(id) => choose(id, field.onChange)}>
              <SelectTrigger ref={trigger}>
                <SelectValue />
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
          ) : (
            <div
              role="group"
              aria-label="Choose a service"
              className="flex max-h-80 flex-col overflow-y-auto rounded-xl border border-border bg-surface"
            >
              {byCategory.map(([cat, list]) => (
                <div key={cat} className="flex flex-col">
                  {byCategory.length > 1 && (
                    <p className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">{cat}</p>
                  )}
                  {list.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        choose(s.id, field.onChange);
                        // The row goes; focus moves to the line that replaces it.
                        requestAnimationFrame(() => trigger.current?.focus());
                      }}
                      className="focus-ring flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60 pointer-coarse:min-h-11"
                    >
                      <ColorDot color={s.color} />
                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                      {!s.isPublic && <span className="text-xs text-subtle-foreground">Private</span>}
                      <span className="tnum shrink-0 text-xs text-muted-foreground">
                        {formatDuration(s.durationMinutes)}
                      </span>
                      <span className="tnum w-12 shrink-0 text-right text-xs text-muted-foreground">
                        {fmt.price(s.priceCents)}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )
        }
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
