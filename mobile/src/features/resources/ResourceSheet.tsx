import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { Resource, TeamMember } from "@shared/api/types";
import { useCreateResource, useDeleteResource, useUpdateResource } from "@shared/api/hooks/use-resources";
import { useBusinessContext } from "@shared/business/business-context";
import { RESOURCE_KINDS } from "@shared/catalog/resources";
import {
  formValuesToResourceInput,
  NO_MEMBER,
  RESOURCE_KIND_TITLE,
  RESOURCE_NAME_PLACEHOLDER,
  resourceFormSchema,
  resourceSwatches,
  resourceToFormValues,
  type ResourceFormValues as V,
} from "@shared/resources/resource-form";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Text } from "~/ui";
import {
  applyApiErrors,
  confirmAction,
  confirmDiscard,
  FormColorField,
  FormNumberField,
  FormRadioGroup,
  FormRootError,
  FormSelect,
  FormSwitch,
  FormTextField,
  useSaveFeedback,
} from "~/ui/form";
import { space } from "~/ui/tokens";

export type ResourceSheetProps = {
  /** The resource to edit; null adds one. */
  resource: Resource | null;
  onClose: () => void;
  team: readonly TeamMember[];
  /** The sort order a new resource gets (one past the last). */
  nextSortOrder: number;
  onSaved?: (resource: Resource) => void;
  /** After a delete (or the deactivation the backend does instead when it has bookings). */
  onDeleted?: () => void;
};

/** Add or edit a resource (admins): the website's ResourceDialog. Render it while open (it starts from `resource`). */
export function ResourceSheet({
  resource,
  onClose,
  team,
  nextSortOrder,
  onSaved,
  onDeleted,
}: ResourceSheetProps) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const create = useCreateResource(business.id);
  const update = useUpdateResource(business.id);
  const remove = useDeleteResource(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<V>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: resourceToFormValues(resource, nextSortOrder),
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const { isDirty, isSubmitting } = form.formState;

  const close = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    const input = formValuesToResourceInput(values, resource?.sortOrder ?? nextSortOrder);
    try {
      const saved = resource
        ? await update.mutateAsync({ id: resource.id, input })
        : await create.mutateAsync(input);
      feedback.saved(resource ? "Saved" : `${saved.name} added`);
      onClose();
      onSaved?.(saved);
    } catch (err) {
      applyApiErrors(form, err);
    }
  });

  const deleteResource = async () => {
    if (!resource) return;
    const ok = await confirmAction({
      title: `Delete ${resource.name}?`,
      message: `If it has any ${v("bookings")} it's deactivated instead, so history stays intact.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (await feedback.run(() => remove.mutateAsync(resource.id), `${resource.name} removed`)) {
      onClose();
      onDeleted?.();
    }
  };

  return (
    <Sheet
      visible
      onClose={() => void close()}
      title={resource ? `Edit ${resource.name}` : `Add a ${v("resource")}`}
      testID="resource-sheet"
      footer={
        <Button
          testID="resource-save"
          label={resource ? "Save" : "Add"}
          fullWidth
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      }
    >
      <Text tone="muted">A person, room or piece of equipment that services need.</Text>
      <FormRadioGroup
        control={form.control}
        name="kind"
        label="Type"
        testID="resource-kind"
        options={RESOURCE_KINDS.map((k) => ({ value: k, label: RESOURCE_KIND_TITLE[k] }))}
      />
      <FormTextField
        control={form.control}
        name="name"
        label="Name"
        testID="resource-name"
        placeholder={RESOURCE_NAME_PLACEHOLDER[kind]}
        autoComplete="off"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <FormTextField
        control={form.control}
        name="description"
        label="Description (optional)"
        testID="resource-description"
        hint={kind === "person" ? `Shown if ${v("customers")} can choose who they see.` : undefined}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
      <FormColorField
        control={form.control}
        name="color"
        label="Colour"
        testID="resource-color"
        swatches={resourceSwatches(resource)}
      />
      {kind === "person" ? (
        <View style={styles.block}>
          <FormSelect
            control={form.control}
            name="memberId"
            label="Team member"
            testID="resource-member"
            options={[
              { value: NO_MEMBER, label: "Not linked" },
              ...team.map((m) => ({
                value: m.id,
                label: `${m.name || m.email}${m.status === "invited" ? " (invited)" : ""}`,
              })),
            ]}
          />
          <Text variant="footnote" tone="subtle">
            They see this calendar and can manage its hours.
          </Text>
        </View>
      ) : (
        <FormNumberField
          control={form.control}
          name="capacity"
          label="Capacity"
          testID="resource-capacity"
          hint="For your reference, e.g. seats in a room."
        />
      )}
      {resource ? (
        <FormSwitch
          control={form.control}
          name="isActive"
          label="Active"
          testID="resource-active"
          description="Inactive ones can't be booked and are hidden from the calendar."
        />
      ) : null}
      <FormRootError control={form.control} />
      {resource ? (
        <View style={styles.delete}>
          <Button
            testID="resource-delete"
            variant="destructive"
            icon={Trash2}
            label="Delete"
            loading={remove.isPending}
            onPress={() => void deleteResource()}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[1] },
  delete: { marginTop: space[4], alignItems: "flex-start" },
});
