"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { ServiceFormValues as V } from "@/lib/services/service-form";
import { SERVICE_LIMITS } from "@/lib/validation/limits";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { Section } from "./section";

export function AddonsSection() {
  const business = useCurrentBusiness();
  const form = useFormContext<V>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "addons" });
  return (
    <Section
      title="Add-ons"
      description="Optional extras that add time and cost."
      action={
        <Button
          size="xs"
          variant="secondary"
          disabled={fields.length >= SERVICE_LIMITS.addons}
          onClick={() => append({ name: "", description: "", extraMinutes: 0, priceCents: 0 })}
        >
          <Plus /> Add add-on
        </Button>
      }
    >
      {fields.length === 0 ? (
        <p className="text-sm text-subtle-foreground">No add-ons.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_auto] items-start gap-2">
              <FormField<V, `addons.${number}.name`> name={`addons.${i}.name`}>
                {(field) => (
                  <Input {...field} placeholder="Add-on name" aria-label={`Add-on ${i + 1} name`} />
                )}
              </FormField>
              <FormField<V, `addons.${number}.extraMinutes`> name={`addons.${i}.extraMinutes`}>
                {(field) => (
                  <NumberInput
                    mode="decimal"
                    value={field.value}
                    onValueChange={(n) => field.onChange(n ?? 0)}
                    unit="+min"
                    aria-label={`Add-on ${i + 1} extra minutes`}
                  />
                )}
              </FormField>
              <FormField<V, `addons.${number}.priceCents`> name={`addons.${i}.priceCents`}>
                {(field) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={(c) => field.onChange(c ?? 0)}
                    currency={business.currency}
                    aria-label={`Add-on ${i + 1} price`}
                  />
                )}
              </FormField>
              <IconButton label={`Remove add-on ${i + 1}`} size="md" onClick={() => remove(i)}>
                <Trash2 />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
