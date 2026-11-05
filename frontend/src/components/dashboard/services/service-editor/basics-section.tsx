"use client";

import { SERVICE_COLORS, type ServiceFormValues as V } from "@/lib/services/service-form";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SwatchGroup } from "@/components/ui/swatch-group";
import { Textarea } from "@/components/ui/textarea";

export function BasicsSection({ categories }: { categories: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <FormField<V, "name"> name="name" label="Name" required>
          {(field) => <Input {...field} placeholder="e.g. Initial consultation" autoComplete="off" />}
        </FormField>
        <FormField<V, "category">
          name="category"
          label="Category"
          optional
          help="Groups services on your page."
        >
          {(field) => (
            <>
              <Input
                {...field}
                list="service-categories"
                autoComplete="off"
                className="[&::-webkit-calendar-picker-indicator]:opacity-0"
              />
              <datalist id="service-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </FormField>
      </div>
      <FormField<V, "description">
        name="description"
        label="Description"
        optional
        help="Shown to people choosing a service."
      >
        {(field) => <Textarea {...field} rows={2} />}
      </FormField>
      <FormField<V, "color"> name="color" label="Calendar colour">
        {(field) => (
          <SwatchGroup
            aria-label="Calendar colour"
            value={field.value}
            onValueChange={field.onChange}
            swatches={SERVICE_COLORS}
            includeValue
          />
        )}
      </FormField>
    </div>
  );
}
