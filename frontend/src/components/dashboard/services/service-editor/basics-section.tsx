"use client";

import { SERVICE_COLORS, type ServiceFormValues as V } from "@/lib/services/service-form";
import { Input } from "@/components/ui/input";
import { SwatchGroup } from "@/components/ui/swatch-group";
import { Textarea } from "@/components/ui/textarea";
import { SettingFormRow } from "../../settings/settings-common";
import { Section } from "./section";

export function BasicsSection({ categories }: { categories: string[] }) {
  return (
    <Section title="What it is" rows>
      <SettingFormRow<V, "name"> name="name" label="Name" required>
        {(field) => <Input {...field} placeholder="e.g. Initial consultation" autoComplete="off" />}
      </SettingFormRow>
      <SettingFormRow<V, "category">
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
      </SettingFormRow>
      <SettingFormRow<V, "description">
        stacked
        name="description"
        label="Description"
        optional
        help="Shown to people choosing a service."
      >
        {(field) => <Textarea {...field} rows={2} />}
      </SettingFormRow>
      <SettingFormRow<V, "color"> name="color" label="Calendar colour">
        {(field) => (
          <SwatchGroup
            aria-label="Calendar colour"
            value={field.value}
            onValueChange={field.onChange}
            swatches={SERVICE_COLORS}
            includeValue
          />
        )}
      </SettingFormRow>
    </Section>
  );
}
