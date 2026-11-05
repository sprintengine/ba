"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import type { CustomerGroup } from "@/lib/api/types";
import {
  useCreateCustomerGroup,
  useCustomerGroups,
  useDeleteCustomerGroup,
  useUpdateCustomerGroup,
} from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { nextSortOrder } from "@/lib/dashboard/sort-order";
import {
  formValuesToGroupInput,
  groupFormSchema,
  groupToFormValues,
  type GroupFormValues as V,
} from "@/lib/settings/group-form";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { applyApiErrors, FormField, FormRootError } from "@/components/ui/form";
import { FormDialog, useEditorDialog } from "@/components/ui/form-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";
import { SettingsHeader } from "./settings-common";

export function GroupsSettings() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const groups = useCustomerGroups(business.id);
  const remove = useDeleteCustomerGroup(business.id);
  const editor = useEditorDialog<CustomerGroup>();
  const list = [...(groups.data ?? [])].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder,
  );

  return (
    <>
      <SettingsHeader
        segment="customer-groups"
        actions={
          <ActionButton
            size="sm"
            variant="primary"
            onClick={() => editor.open(null)}
            icon={<Plus />}
            label="New group"
            collapse={false}
          />
        }
      />
      <p className="mb-6 max-w-prose text-sm text-muted-foreground">
        Groups let some {v("customers")} see different hours or services. A restricted group only sees hours
        that name it, and only you can add someone to it, on their profile.
      </p>
      {groups.isError ? (
        <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
      ) : groups.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <EmptyState
            icon={<UsersRound />}
            title="No groups"
            description={`Everyone books the same hours and services. Add a group when some ${v("customers")} need their own.`}
          />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {list.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {g.name}
                  {g.restricted && (
                    <Badge tone="warning" className="h-5">
                      <Lock /> Restricted
                    </Badge>
                  )}
                  {!g.isActive && <Badge className="h-5">Inactive</Badge>}
                </span>
                {g.description && (
                  <span className="truncate text-xs text-muted-foreground">{g.description}</span>
                )}
              </div>
              <IconButton label={`Edit ${g.name}`} onClick={() => editor.open(g)}>
                <Pencil />
              </IconButton>
              <ConfirmDialog
                trigger={
                  <IconButton label={`Delete ${g.name}`}>
                    <Trash2 />
                  </IconButton>
                }
                title={`Delete ${g.name}?`}
                description={`If it's used by hours, services or ${v("bookings")} it's deactivated instead.`}
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  await withToast(() => remove.mutateAsync(g.id), "Group removed");
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {editor.current && (
        <GroupDialog
          key={editor.current.key}
          group={editor.current.item}
          nextSort={nextSortOrder(list)}
          {...editor.dialogProps}
        />
      )}
    </>
  );
}

function GroupDialog({
  group,
  nextSort,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  group: CustomerGroup | null;
  nextSort: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const create = useCreateCustomerGroup(business.id);
  const update = useUpdateCustomerGroup(business.id);
  const form = useForm<V>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: groupToFormValues(group),
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      form={form}
      title={group ? `Edit ${group.name}` : "New group"}
      description={`Give some ${v("customers")} their own hours or services.`}
      submitLabel={group ? "Save" : "Add group"}
      onSubmit={async (val) => {
        const input = formValuesToGroupInput(val, group?.sortOrder ?? nextSort);
        try {
          if (group) await update.mutateAsync({ id: group.id, input });
          else await create.mutateAsync(input);
          toast.success(group ? "Group saved" : "Group added");
          onOpenChange(false);
        } catch (err) {
          applyApiErrors(form, err);
        }
      }}
    >
      <FormField<V, "name"> name="name" label="Name" required>
        {(field) => <Input {...field} autoFocus placeholder="e.g. Members" />}
      </FormField>
      <FormField<V, "description">
        name="description"
        label="Description"
        optional
        help="Shown when people choose their group while booking."
      >
        {(field) => <Textarea {...field} rows={2} />}
      </FormField>
      <FormField<V, "restricted">
        name="restricted"
        orientation="horizontal"
        label="Restricted"
        help="Only sees hours that list this group. People can't pick it themselves, so you assign it."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      {group && (
        <FormField<V, "isActive"> name="isActive" orientation="horizontal" label="Active">
          {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        </FormField>
      )}
      <FormRootError />
    </FormDialog>
  );
}
