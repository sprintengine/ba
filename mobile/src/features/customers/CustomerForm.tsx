/**
 * A customer's contact details, group and private notes: adding one (the Add sheet) and editing one (their profile).
 * The website's rules (`@shared/dashboard/customer-schema`); the server's field errors show on their fields.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { errorMessage, isApiError } from "@shared/api/client";
import { useCustomerGroups } from "@shared/api/hooks/use-business";
import type { Customer, CustomerInput } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import {
  customerSchema,
  customerToValues,
  valuesToCustomerInput,
  type CustomerFormValues,
} from "@shared/dashboard/customer-schema";
import { Button, Select, Text, TextField } from "~/ui";
import { space } from "~/ui/tokens";

const FIELDS: FieldPath<CustomerFormValues>[] = ["name", "email", "phone", "groupId", "notes"];

export function CustomerForm({
  initial,
  submitLabel,
  onSubmit,
  secondary,
  testID,
}: {
  initial?: Customer | null;
  submitLabel: string;
  /** Saves; a rejection's field errors show on the fields, anything else above the button. */
  onSubmit: (input: CustomerInput) => Promise<unknown>;
  /** Beside the submit button (Cancel). */
  secondary?: ReactNode;
  testID?: string;
}) {
  const business = useCurrentBusiness();
  const groups = useCustomerGroups(business.id);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: customerToValues(initial),
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const activeGroups = (groups.data ?? []).filter((g) => g.isActive || g.id === initial?.groupId);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(valuesToCustomerInput(values));
      form.reset(values);
    } catch (err) {
      const fields = isApiError(err) ? err.fields : {};
      const known = FIELDS.filter((f) => fields[f]);
      known.forEach((f) => form.setError(f, { message: fields[f] }));
      if (known.length === 0) form.setError("root", { message: errorMessage(err) });
    }
  });

  return (
    <View style={styles.form} testID={testID}>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <TextField
            testID="customer-name"
            label="Name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            autoComplete="off"
            textContentType="name"
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="email"
        render={({ field }) => (
          <TextField
            testID="customer-email"
            label="Email (optional)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="phone"
        render={({ field }) => (
          <TextField
            testID="customer-phone"
            label="Phone (optional)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="phone-pad"
            autoComplete="off"
            error={errors.phone?.message}
          />
        )}
      />
      {activeGroups.length > 0 ? (
        <Controller
          control={form.control}
          name="groupId"
          render={({ field }) => (
            <Select
              testID="customer-group"
              label="Group"
              value={field.value}
              onChange={field.onChange}
              error={errors.groupId?.message}
              options={[
                { value: "none", label: "No group" },
                ...activeGroups.map((g) => ({
                  value: g.id,
                  label: g.restricted ? `${g.name} (restricted)` : g.name,
                  description: g.description ?? undefined,
                })),
              ]}
            />
          )}
        />
      ) : null}
      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <TextField
            testID="customer-notes"
            label="Notes (optional)"
            hint="Private to your team."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            multiline
            error={errors.notes?.message}
          />
        )}
      />
      {errors.root?.message ? (
        <Text variant="callout" tone="danger" accessibilityLiveRegion="polite" testID="customer-form-error">
          {errors.root.message}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {secondary}
        <Button
          testID="customer-submit"
          label={submitLabel}
          loading={isSubmitting}
          disabled={!!initial && !isDirty}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: space[2] },
});
