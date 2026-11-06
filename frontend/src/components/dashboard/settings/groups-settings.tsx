"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ExamplePreview } from "@/components/ui/example-preview";
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
import { SettingGroup, SettingItem, SettingList, SettingsHeader } from "./settings-common";

export function GroupsSettings() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const groups = useCustomerGroups(business.id);
  const remove = useDeleteCustomerGroup(business.id);
  const editor = useEditorDialog<CustomerGroup>();
  const list = [...(groups.data ?? [])].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder,
  );

  const newGroup = (
    <ActionButton
      size="sm"
      variant="primary"
      onClick={() => editor.open(null)}
      icon={<Plus />}
      label="New group"
      collapse={false}
    />
  );

  return (
    <>
      <SettingsHeader segment="customer-groups" lede actions={list.length > 0 && newGroup} />
      {groups.isError ? (
        <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
      ) : groups.isPending ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <SettingGroup
          title={list.length > 0 ? "Your groups" : "What a group looks like"}
          description={
            list.length > 0
              ? "Members of a restricted group can book only the hours assigned to it. You add people to a group on their profile."
              : undefined
          }
        >
          {list.length === 0 ? (
            <>
              <ExamplePreview className="p-1.5">
                <SettingList>
                  <SettingItem
                    title="Members"
                    chips={
                      <Badge tone="warning" className="h-5">
                        <Lock /> Restricted
                      </Badge>
                    }
                    meta={
                      <span className="truncate text-[0.8125rem] leading-5 text-muted-foreground">
                        Their own hours and prices
                      </span>
                    }
                  />
                </SettingList>
              </ExamplePreview>
              <EmptyState
                size="sm"
                headingLevel={4}
                title="Everyone books alike"
                description={`Everyone books the same hours and services. Add a group when some ${v("customers")} need their own.`}
                action={newGroup}
              />
            </>
          ) : (
            <SettingList>
              {list.map((g) => (
                <SettingItem
                  key={g.id}
                  dimmed={!g.isActive}
                  title={g.name}
                  chips={
                    <>
                      {g.restricted && (
                        <Badge tone="warning" className="h-5">
                          <Lock /> Restricted
                        </Badge>
                      )}
                      {!g.isActive && <Badge className="h-5">Inactive</Badge>}
                    </>
                  }
                  meta={
                    g.description && (
                      <span className="truncate text-[0.8125rem] leading-5 text-muted-foreground">
                        {g.description}
                      </span>
                    )
                  }
                  actions={
                    <>
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
                    </>
                  }
                />
              ))}
            </SettingList>
          )}
        </SettingGroup>
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
