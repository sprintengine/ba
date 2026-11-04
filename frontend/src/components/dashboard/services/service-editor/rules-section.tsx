"use client";

import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Lock } from "lucide-react";
import type { CustomerGroup } from "@/lib/api/types";
import { useCustomerGroups } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { ServiceFormValues as V } from "@/lib/services/service-form";
import { useVocabulary } from "@/lib/vocabulary";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, useFieldControlProps, useFieldLabelledBy } from "@/components/ui/field";
import { FormField } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Section } from "./section";

export function RulesSection() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const groups = useCustomerGroups(business.id);
  const form = useFormContext<V>();
  const allowed = useWatch({ control: form.control, name: "allowedGroupIds" });
  // An inactive group the service already allows still applies, so it's listed (marked) until it's unticked and saved.
  const saved = form.formState.defaultValues?.allowedGroupIds ?? [];
  const shown = (groups.data ?? []).filter(
    (g) => g.isActive || allowed.includes(g.id) || saved.includes(g.id),
  );
  return (
    <Section title="Booking rules">
      <FormField<V, "requiresApproval">
        name="requiresApproval"
        orientation="horizontal"
        label="Approve each request"
        help={`${v("bookings", { title: true })} stay pending until you accept them.`}
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      <FormField<V, "isPublic">
        name="isPublic"
        orientation="horizontal"
        label="Show on your booking page"
        help="Private services can still be booked by your team."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      <FormField<V, "isActive">
        name="isActive"
        orientation="horizontal"
        label="Active"
        help="Inactive services can't be booked by anyone."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      <FormField<V, "locationType"> name="locationType" label="Where it happens" className="sm:w-72">
        {(field) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="business">At your address</SelectItem>
              <SelectItem value="customer">At the {v("customer")}&apos;s address</SelectItem>
              <SelectItem value="online">Online</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>
      {shown.length > 0 && (
        <Field
          label="Who can book"
          help={
            allowed.length === 0
              ? "Everyone (except restricted groups on hours they aren't listed for)."
              : "Only these groups."
          }
        >
          <AllowedGroups
            groups={shown}
            value={allowed}
            onChange={(ids) => form.setValue("allowedGroupIds", ids, { shouldDirty: true })}
          />
        </Field>
      )}
    </Section>
  );
}

/**
 * The customer-group checkboxes: a group named by the surrounding field's label and help (a `<label for>` can't name
 * it), each checkbox with its own id (the field's id belongs to none of them).
 */
function AllowedGroups({
  groups,
  value,
  onChange,
}: {
  groups: CustomerGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const id = useId();
  const labelledBy = useFieldLabelledBy(false);
  const { "aria-describedby": describedBy } = useFieldControlProps<{ "aria-describedby"?: string }>({});
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex flex-col gap-2 rounded-xl border border-border p-3"
    >
      {groups.map((g) => (
        <label key={g.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox
            id={`${id}-${g.id}`}
            checked={value.includes(g.id)}
            onCheckedChange={(c) => onChange(c ? [...value, g.id] : value.filter((x) => x !== g.id))}
          />
          {g.name}
          {g.restricted && (
            <Badge tone="warning" className="h-5">
              <Lock /> Restricted
            </Badge>
          )}
          {!g.isActive && <Badge className="h-5">Inactive</Badge>}
        </label>
      ))}
    </div>
  );
}
