"use client";

import { useController, useWatch } from "react-hook-form";
import type { PublicService, ServicesContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { TextField, ToggleField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";
import { useEditorServices } from "../editor-data";

export function ServicesForm({ section }: { section: SiteSectionOf<"services"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <TextField<ServicesContent> name="heading" label="Heading" max={LIMITS.heading} />
      <TextField<ServicesContent> name="intro" label="Intro" max={LIMITS.intro} optional multiline />
      <ServicePicker />
      <ToggleField<ServicesContent> name="showPrices" label="Show prices" />
      <ToggleField<ServicesContent> name="showDurations" label="Show durations" />
    </SectionForm>
  );
}

/** "All services" or a chosen subset (in the services' own order). Names and prices stay live. */
function ServicePicker() {
  const services = useEditorServices();
  const { field } = useController<ServicesContent, "serviceIds">({ name: "serviceIds" });
  const ids = useWatch<ServicesContent, "serviceIds">({ name: "serviceIds" });
  const all = ids.length === 0;
  const toggle = (s: PublicService, on: boolean) => {
    const base = all ? services.map((x) => x.id) : ids;
    const next = services.map((x) => x.id).filter((id) => (id === s.id ? on : base.includes(id)));
    field.onChange(next.length === services.length ? [] : next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Services shown</legend>
      <Field
        label="Show all public services"
        orientation="horizontal"
        help="New services appear automatically."
      >
        <Switch checked={all} onCheckedChange={(on) => field.onChange(on ? [] : services.map((s) => s.id))} />
      </Field>
      {!all && (
        <ul className="flex flex-col gap-2 rounded-xl border border-border p-3">
          {services.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={ids.includes(s.id)} onCheckedChange={(v) => toggle(s, v === true)} />
                {s.name}
              </label>
            </li>
          ))}
          {services.length === 0 && (
            <li className="text-sm text-muted-foreground">No public services yet.</li>
          )}
        </ul>
      )}
    </fieldset>
  );
}
