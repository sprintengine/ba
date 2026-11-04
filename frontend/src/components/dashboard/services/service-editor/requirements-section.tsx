"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { Resource } from "@/lib/api/types";
import { useResources } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { ServiceFormValues as V } from "@/lib/services/service-form";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { SERVICE_LIMITS } from "@/lib/validation/limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFieldControlProps, useFieldLabelledBy } from "@/components/ui/field";
import { FormField } from "@/components/ui/form";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/ui/number-input";
import { ResourceKindIcon } from "../../common";
import { Section } from "./section";

export function RequirementsSection() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const resources = useResources(business.id);
  const form = useFormContext<V>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "requirements" });
  const values = useWatch({ control: form.control, name: "requirements" });
  // An inactive resource a requirement already names is still listed (marked), so it can be taken off.
  const choices = (ids: string[]) => (resources.data ?? []).filter((r) => r.isActive || ids.includes(r.id));
  return (
    <Section
      title={`Who and what it needs`}
      description={`Each requirement is filled by one (or more) of the ${v("resources")} you pick — e.g. 1 therapist and 1 room.`}
      action={
        <Button
          size="xs"
          variant="secondary"
          disabled={fields.length >= SERVICE_LIMITS.requirements}
          onClick={() => append({ label: "", quantity: 1, customerSelectable: false, resourceIds: [] })}
        >
          <Plus /> Add requirement
        </Button>
      }
    >
      {fields.length === 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Without a requirement nobody can be booked for
          this service.
        </p>
      )}
      {fields.map((f, i) => {
        const r = values[i];
        return (
          <div
            key={f.id}
            role="group"
            aria-label={`Requirement ${i + 1}`}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 dark:bg-surface-raised"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-start gap-2">
              <FormField<V, `requirements.${number}.label`> name={`requirements.${i}.label`} label="Label">
                {(field) => <Input {...field} placeholder={`e.g. ${v("resource", { title: true })}`} />}
              </FormField>
              <FormField<V, `requirements.${number}.quantity`>
                name={`requirements.${i}.quantity`}
                label="How many"
              >
                {(field) => (
                  <NumberInput
                    mode="decimal"
                    value={field.value}
                    onValueChange={(n) => field.onChange(n ?? 1)}
                    min={1}
                  />
                )}
              </FormField>
              <IconButton
                label={`Remove requirement ${i + 1}`}
                size="md"
                className="mt-6"
                onClick={() => remove(i)}
              >
                <Trash2 />
              </IconButton>
            </div>
            <FormField<V, `requirements.${number}.resourceIds`>
              name={`requirements.${i}.resourceIds`}
              label="Can be done by"
            >
              {(field) => (
                <ResourceChoices
                  resources={choices(field.value)}
                  value={field.value}
                  onChange={field.onChange}
                  empty={`Add ${v("resources")} first.`}
                />
              )}
            </FormField>
            <FormField<V, `requirements.${number}.customerSelectable`>
              name={`requirements.${i}.customerSelectable`}
              orientation="horizontal"
              label={`Let the ${v("customer")} choose`}
              help={
                r?.label
                  ? `They pick their ${r.label.toLowerCase()} when booking.`
                  : "They pick who they see when booking."
              }
            >
              {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            </FormField>
          </div>
        );
      })}
    </Section>
  );
}

/**
 * Toggle buttons for the resources that can fill a requirement. A `<label for>` can't name a group of buttons, so the
 * group points at its field's label and error itself.
 */
function ResourceChoices({
  resources,
  value,
  onChange,
  empty,
}: {
  resources: Resource[];
  value: string[];
  onChange: (ids: string[]) => void;
  empty: string;
}) {
  const labelledBy = useFieldLabelledBy(false);
  const { "aria-describedby": describedBy } = useFieldControlProps<{ "aria-describedby"?: string }>({});
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-1.5"
    >
      {resources.map((res) => {
        const on = value.includes(res.id);
        return (
          <button
            key={res.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== res.id) : [...value, res.id])}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10 pointer-coarse:px-3.5 pointer-coarse:text-sm",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            <ResourceKindIcon kind={res.kind} />
            {res.name}
            {!res.isActive && <Badge className="-mr-1.5 h-4.5 px-1.5">Inactive</Badge>}
          </button>
        );
      })}
      {resources.length === 0 && <span className="text-sm text-subtle-foreground">{empty}</span>}
    </div>
  );
}
