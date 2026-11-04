import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { CustomerGroup } from "@shared/api/types";
import {
  useCreateCustomerGroup,
  useDeleteCustomerGroup,
  useUpdateCustomerGroup,
} from "@shared/api/hooks/use-business";
import { useBusinessContext } from "@shared/business/business-context";
import {
  formValuesToGroupInput,
  groupFormSchema,
  groupToFormValues,
  type GroupFormValues as V,
} from "@shared/settings/group-form";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Text } from "~/ui";
import {
  applyApiErrors,
  confirmAction,
  confirmDiscard,
  FormRootError,
  FormSwitch,
  FormTextField,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";

/**
 * Add or edit a customer group (the website's GroupDialog): name, description, restricted, and active for an existing
 * group. Editing also offers deleting it; a group in use is deactivated instead (the server decides).
 */
export function GroupSheet({
  group,
  nextSort,
  onClose,
}: {
  group: CustomerGroup | null;
  nextSort: number;
  onClose: () => void;
}) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const create = useCreateCustomerGroup(business.id);
  const update = useUpdateCustomerGroup(business.id);
  const remove = useDeleteCustomerGroup(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<V>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: groupToFormValues(group),
  });
  const { isDirty, isSubmitting } = form.formState;
  const { leave } = useUnsavedChangesGuard(isDirty);

  const close = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    const input = formValuesToGroupInput(values, group?.sortOrder ?? nextSort);
    try {
      if (group) await update.mutateAsync({ id: group.id, input });
      else await create.mutateAsync(input);
      feedback.saved(group ? "Group saved" : "Group added");
      leave(onClose);
    } catch (err) {
      applyApiErrors(form, err);
    }
  });

  const deleteGroup = async () => {
    if (!group) return;
    const ok = await confirmAction({
      title: `Delete ${group.name}?`,
      message: `If it's used by hours, services or ${v("bookings")} it's deactivated instead.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (await feedback.run(() => remove.mutateAsync(group.id), "Group removed")) leave(onClose);
  };

  return (
    <Sheet
      visible
      onClose={() => void close()}
      title={group ? `Edit ${group.name}` : "New group"}
      testID="group-sheet"
      footer={
        <Button
          testID="group-save"
          label={group ? "Save" : "Add group"}
          fullWidth
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      }
    >
      <Text tone="muted">Give some {v("customers")} their own hours or services.</Text>
      <FormTextField
        control={form.control}
        name="name"
        label="Name"
        testID="group-name"
        placeholder="e.g. Members"
        autoFocus={!group}
        returnKeyType="next"
        onSubmitEditing={() => form.setFocus("description")}
      />
      <FormTextField
        control={form.control}
        name="description"
        label="Description (optional)"
        testID="group-description"
        hint="Shown when people choose their group while booking."
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
      <FormSwitch
        control={form.control}
        name="restricted"
        label="Restricted"
        description="Only sees hours that list this group. People can't pick it themselves, so you assign it."
        testID="group-restricted"
      />
      {group ? (
        <FormSwitch control={form.control} name="isActive" label="Active" testID="group-active" />
      ) : null}
      <FormRootError control={form.control} />
      {group ? (
        <View style={styles.delete}>
          <Button
            testID="group-delete"
            variant="destructive"
            icon={Trash2}
            label="Delete group"
            loading={remove.isPending}
            onPress={() => void deleteGroup()}
          />
          <Text variant="footnote" tone="subtle">
            If it&apos;s used by hours, services or {v("bookings")} it&apos;s deactivated instead.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({ delete: { marginTop: space[4], gap: space[2] } });
