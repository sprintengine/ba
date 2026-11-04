"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import type { Resource, TeamMember } from "@/lib/api/types";
import { useCreateResource, useDeleteResource, useUpdateResource } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { RESOURCE_KINDS } from "@/lib/catalog/resources";
import {
  formValuesToResourceInput,
  NO_MEMBER,
  RESOURCE_KIND_TITLE,
  RESOURCE_NAME_PLACEHOLDER,
  resourceFormSchema,
  resourceSwatches,
  resourceToFormValues,
  type ResourceFormValues as V,
} from "@/lib/resources/resource-form";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { applyApiErrors, FormField, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SwatchGroup } from "@/components/ui/swatch-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";
import { FormDialog } from "@/components/ui/form-dialog";
import { NumberInput } from "@/components/ui/number-input";
import { KIND_ICON } from "../common";

/** Create or edit a resource (admins). */
export function ResourceDialog({
  resource,
  open,
  onOpenChange,
  team,
  nextSortOrder,
  onSaved,
  returnFocusTo,
}: {
  resource: Resource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null;
  team: TeamMember[];
  nextSortOrder: number;
  onSaved?: (r: Resource) => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const create = useCreateResource(business.id);
  const update = useUpdateResource(business.id);
  const remove = useDeleteResource(business.id);
  const form = useForm<V>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: resourceToFormValues(resource, nextSortOrder),
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const swatches = resourceSwatches(resource);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      form={form}
      title={resource ? `Edit ${resource.name}` : `Add a ${v("resource")}`}
      description="A person, room or piece of equipment that services need."
      submitLabel={resource ? "Save" : "Add"}
      footerStart={
        resource ? (
          <ConfirmDialog
            trigger={
              <Button variant="danger-ghost">
                <Trash2 /> Delete
              </Button>
            }
            title={`Delete ${resource.name}?`}
            description={`If it has any ${v("bookings")} it's deactivated instead, so history stays intact.`}
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              if (await withToast(() => remove.mutateAsync(resource.id), `${resource.name} removed`))
                onOpenChange(false);
            }}
          />
        ) : null
      }
      onSubmit={async (values) => {
        const input = formValuesToResourceInput(values, resource?.sortOrder ?? nextSortOrder);
        try {
          const saved = resource
            ? await update.mutateAsync({ id: resource.id, input })
            : await create.mutateAsync(input);
          toast.success(resource ? "Saved" : `${saved.name} added`);
          onSaved?.(saved);
          onOpenChange(false);
        } catch (err) {
          applyApiErrors(form, err);
        }
      }}
    >
      <FormField<V, "kind"> name="kind" label="Type">
        {(field) => (
          <RadioCards value={field.value} onValueChange={field.onChange} columns={3}>
            {RESOURCE_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <RadioCard key={k} value={k} icon={<Icon />} title={RESOURCE_KIND_TITLE[k]} className="p-3" />
              );
            })}
          </RadioCards>
        )}
      </FormField>
      <FormField<V, "name"> name="name" label="Name" required>
        {(field) => <Input {...field} autoComplete="off" placeholder={RESOURCE_NAME_PLACEHOLDER[kind]} />}
      </FormField>
      <FormField<V, "description">
        name="description"
        label="Description"
        optional
        help={kind === "person" ? `Shown if ${v("customers")} can choose who they see.` : undefined}
      >
        {(field) => <Textarea {...field} rows={2} />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField<V, "color"> name="color" label="Colour">
          {(field) => (
            <SwatchGroup
              aria-label="Colour"
              size="sm"
              className="gap-1.5 [&>button]:ring-offset-surface-raised"
              value={field.value}
              onValueChange={field.onChange}
              swatches={swatches}
            />
          )}
        </FormField>
        {kind === "person" ? (
          <FormField<V, "memberId">
            name="memberId"
            label="Team member"
            help="They see this calendar and can manage its hours."
          >
            {(field) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEMBER}>Not linked</SelectItem>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name || m.email}
                      {m.status === "invited" ? " (invited)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : (
          <FormField<V, "capacity">
            name="capacity"
            label="Capacity"
            help="For your reference, e.g. seats in a room."
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
        )}
      </div>
      {resource && (
        <FormField<V, "isActive">
          name="isActive"
          orientation="horizontal"
          label="Active"
          help="Inactive ones can't be booked and are hidden from the calendar."
        >
          {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        </FormField>
      )}
      <FormRootError />
    </FormDialog>
  );
}
