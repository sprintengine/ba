"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import type { ServiceFormValues as V } from "@/lib/services/service-form";
import { SERVICE_LIMITS } from "@/lib/validation/limits";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { Section } from "./section";

export function OptionsSection() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const form = useFormContext<V>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "options" });
  const duration = useWatch({ control: form.control, name: "durationMinutes" });
  const price = useWatch({ control: form.control, name: "priceCents" });
  return (
    <Section
      title="Options"
      description={`Versions with their own length and price, such as car size or lesson length. The ${v("customer")} picks one.`}
      action={
        <Button
          size="xs"
          variant="secondary"
          disabled={fields.length >= SERVICE_LIMITS.options}
          onClick={() => append({ name: "", description: "", durationMinutes: duration, priceCents: price })}
        >
          <Plus /> Add option
        </Button>
      }
    >
      {fields.length === 0 ? (
        <p className="text-sm text-subtle-foreground">No options — everyone books the same thing.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-2">
          {fields.map((f, i) => (
            // Phones: the name gets its own line (with remove beside it) so it isn't squeezed to a few letters.
            <div
              key={f.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_auto]"
            >
              <FormField<V, `options.${number}.name`>
                name={`options.${i}.name`}
                className="max-sm:col-span-2"
              >
                {(field) => (
                  <Input {...field} placeholder="Option name" aria-label={`Option ${i + 1} name`} />
                )}
              </FormField>
              <FormField<V, `options.${number}.durationMinutes`> name={`options.${i}.durationMinutes`}>
                {(field) => (
                  <NumberInput
                    mode="decimal"
                    value={field.value}
                    onValueChange={(n) => field.onChange(n ?? 0)}
                    unit="min"
                    aria-label={`Option ${i + 1} duration`}
                  />
                )}
              </FormField>
              <FormField<V, `options.${number}.priceCents`> name={`options.${i}.priceCents`}>
                {(field) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={(c) => field.onChange(c ?? 0)}
                    currency={business.currency}
                    aria-label={`Option ${i + 1} price`}
                  />
                )}
              </FormField>
              <IconButton
                label={`Remove option ${i + 1}`}
                size="md"
                className="max-sm:col-start-3 max-sm:row-start-1"
                onClick={() => remove(i)}
              >
                <Trash2 />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
