import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Controller, useFormContext, useFormState, useWatch } from "react-hook-form";
import { Search, UserPlus } from "lucide-react-native";
import { useCustomers } from "@shared/api/hooks/use-customers";
import { useCurrentBusiness } from "@shared/business/business-context";
import type { NewBookingPrefill, NewBookingValues as Values } from "@shared/dashboard/new-booking";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Text, TextField, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { ChoiceRow } from "../fields";
import { PersonAvatar } from "../parts";

type Picked = NonNullable<NewBookingPrefill["customer"]>;

/** Step 3: find an existing customer (by name, email or phone), or enter a new one prefilled from the search. */
export function CustomerStep({ prefill }: { prefill?: NewBookingPrefill["customer"] }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const { colors } = useTheme();
  const form = useFormContext<Values>();
  const [newCustomer, customerId] = useWatch({ control: form.control, name: ["newCustomer", "customerId"] });
  const { errors } = useFormState({ control: form.control, name: ["customerId", "customer"] });
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Picked | null>(prefill ?? null);
  const q = useDebouncedValue(search.trim(), 250);
  const customers = useCustomers(
    business.id,
    { q: q || undefined, limit: 20 },
    { enabled: !newCustomer && (!picked || search.length > 0) },
  );

  if (newCustomer) {
    return (
      <View style={[styles.newBox, { backgroundColor: colors.surfaceSunken }]} testID="new-customer">
        <View style={styles.row}>
          <Text weight="semibold" style={styles.flex}>
            New {v("customer")}
          </Text>
          <Button
            label="Search existing"
            icon={Search}
            variant="ghost"
            size="sm"
            onPress={() => form.setValue("newCustomer", false)}
          />
        </View>
        <Controller
          control={form.control}
          name="customer.name"
          render={({ field }) => (
            <TextField
              testID="new-customer-name"
              label="Name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoComplete="off"
              autoCapitalize="words"
              placeholder="Alex Morgan"
              error={errors.customer?.name?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="customer.email"
          render={({ field }) => (
            <TextField
              testID="new-customer-email"
              label="Email (optional)"
              hint="For confirmations and reminders."
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
              error={errors.customer?.email?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="customer.phone"
          render={({ field }) => (
            <TextField
              testID="new-customer-phone"
              label={business.policies.requireCustomerPhone ? "Phone" : "Phone (optional)"}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              keyboardType="phone-pad"
              autoComplete="off"
              error={errors.customer?.phone?.message}
            />
          )}
        />
      </View>
    );
  }

  const results = customers.data?.items ?? [];
  const list = picked && !results.some((c) => c.id === picked.id) && !search ? [picked] : [];
  const shown = [
    ...list,
    ...results.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
  ];
  const typed = search.trim();

  return (
    <View style={styles.root}>
      <TextField
        testID="customer-search"
        label={`Find a ${v("customer")}`}
        placeholder="Name, email or phone"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        error={errors.customerId?.message}
      />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={v("customers", { title: true })}
        style={styles.list}
      >
        {customers.isFetching && results.length === 0 ? (
          <ActivityIndicator accessibilityLabel="Searching" color={colors.mutedForeground} />
        ) : null}
        {shown.slice(0, 8).map((c) => (
          <ChoiceRow
            key={c.id}
            testID={`customer-${c.id}`}
            title={c.name}
            detail={c.email ?? c.phone ?? undefined}
            leading={<PersonAvatar name={c.name} size={32} />}
            selected={c.id === customerId}
            onPress={() => {
              form.setValue("customerId", c.id, { shouldValidate: !!errors.customerId });
              setPicked(c);
            }}
          />
        ))}
        {!customers.isFetching && typed && results.length === 0 ? (
          <Text variant="callout" tone="muted">
            No {v("customers")} found.
          </Text>
        ) : null}
      </View>
      <Button
        testID="new-customer-button"
        label={`New ${v("customer")}${typed ? `: “${typed}”` : ""}`}
        icon={UserPlus}
        variant="secondary"
        onPress={() => {
          form.setValue("newCustomer", true);
          if (typed && !typed.includes("@")) form.setValue("customer.name", typed);
          if (typed.includes("@")) form.setValue("customer.email", typed);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  list: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
  newBox: { gap: space[3], padding: space[4], borderRadius: radius.xl },
});
