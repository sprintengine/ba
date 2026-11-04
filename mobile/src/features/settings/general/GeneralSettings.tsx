import { zodResolver } from "@hookform/resolvers/zod";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Check, CircleAlert } from "lucide-react-native";
import { useDeleteBusiness, useUpdateBusiness } from "@shared/api/hooks/use-business";
import { useSlugAvailability } from "@shared/api/hooks/use-onboarding";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { COMMON_TIME_ZONES, isValidTimeZone, supportedTimeZones, timeZoneOptions } from "@shared/format";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { flattenFieldErrors } from "@shared/settings/api-fields";
import {
  businessToGeneralValues,
  deleteBusinessDescription,
  generalSettingsSchema,
  generalValuesToUpdate,
  SLUG_PATTERN,
  type GeneralSettingsValues as V,
} from "@shared/settings/general-form";
import { useVocabulary } from "@shared/vocabulary";
import { env } from "~/config/env";
import { Button, Icon, Section, Text, useTheme } from "~/ui";
import {
  applyApiErrors,
  confirmAction,
  FormRootError,
  FormSearchSelect,
  FormSelect,
  FormSwitch,
  FormTextField,
  HeaderButton,
  SaveBar,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import { CURRENCIES, LOCALES } from "../options";
import { SettingsPage } from "../SettingsPage";

/** Settings › General (the website's GeneralSettings): name, booking page address, region, contact, deleting. */
export function GeneralSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const update = useUpdateBusiness(business.id);
  const remove = useDeleteBusiness(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<V>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: businessToGeneralValues(business),
  });
  const { isDirty, isSubmitting } = form.formState;
  const { leave } = useUnsavedChangesGuard(isDirty);
  const slug = useWatch({ control: form.control, name: "slug" });
  const debounced = useDebouncedValue(slug.trim(), 350);
  const checkSlug = debounced !== business.slug && SLUG_PATTERN.test(debounced) && debounced.length >= 3;
  const availability = useSlugAvailability(checkSlug ? debounced : "");
  const taken = checkSlug && availability.data?.available === false;
  const [zones] = useState(() =>
    timeZoneOptions([business.timezone, ...COMMON_TIME_ZONES, ...supportedTimeZones()]),
  );

  const submit = form.handleSubmit(async (values) => {
    if (taken) {
      form.setError("slug", { message: "That address is taken" });
      return;
    }
    try {
      const saved = await update.mutateAsync(generalValuesToUpdate(values));
      form.reset(businessToGeneralValues(saved));
      feedback.saved("Settings saved");
      if (saved.slug !== business.slug) {
        leave(() => router.replace(`/dashboard/${saved.slug}/settings/general` as Href));
      }
    } catch (err) {
      applyApiErrors(form, flattenFieldErrors(err, ["address"]));
    }
  });

  const deleteBusiness = async () => {
    const ok = await confirmAction({
      title: `Delete ${business.name}?`,
      message: `The booking page goes offline immediately, and you can't undo this from your dashboard. Your ${v("customers")} can only see and cancel their ${v("bookings")}.`,
      confirmLabel: "Delete business",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync();
      feedback.saved("Business deleted");
      leave(() => router.replace("/dashboard"));
    } catch (err) {
      feedback.failed(err);
    }
  };

  const host = (env.webUrl || "https://bookanything.ie").replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <SettingsPage
      segment="general"
      headerRight={() => (
        <HeaderButton
          label="Save"
          primary
          testID="settings-save"
          disabled={!isDirty}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      )}
    >
      <Section title="Your business" description="How you appear on your booking page and in emails.">
        <FormTextField
          control={form.control}
          name="name"
          label="Business name"
          testID="general-name"
          autoComplete="organization"
          textContentType="organizationName"
        />
        <View style={styles.slug}>
          <FormTextField
            control={form.control}
            name="slug"
            label="Booking page address"
            testID="general-slug"
            autoCapitalize="none"
            autoCorrect={false}
            transform={(text) => text.toLowerCase().replace(/\s+/g, "-")}
            hint={
              slug !== business.slug
                ? `${host}/${slug}. Changing it breaks links you've already shared.`
                : `${host}/${slug}. Lowercase letters, numbers and hyphens.`
            }
          />
          <SlugStatus
            checking={checkSlug && availability.isFetching}
            available={checkSlug ? availability.data?.available : undefined}
          />
        </View>
        {taken ? (
          <View style={styles.taken}>
            <Text variant="footnote" tone="danger">
              Taken.
            </Text>
            {availability.data?.suggestion ? (
              <Button
                size="sm"
                variant="ghost"
                label={`Use ${availability.data.suggestion}`}
                onPress={() =>
                  form.setValue("slug", availability.data!.suggestion!, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
        <FormTextField
          control={form.control}
          name="description"
          label="About (optional)"
          hint="A sentence or two at the top of your booking page."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <FormSwitch
          control={form.control}
          name="published"
          label="Published"
          testID="general-published"
          description="When off, your booking page is hidden from the public and only your team can preview it."
        />
      </Section>

      <Section title="Region" description="Times on your calendar and in emails use this timezone.">
        <FormSearchSelect
          control={form.control}
          name="timezone"
          label="Timezone"
          testID="general-timezone"
          options={zones}
          searchPlaceholder="Search cities…"
          custom={(query) =>
            isValidTimeZone(query)
              ? { value: query, label: query.replace(/_/g, " "), hint: "Use this timezone" }
              : null
          }
        />
        <FormSelect
          control={form.control}
          name="currency"
          label="Currency"
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
        <Text variant="footnote" tone="subtle">
          Changing the currency doesn&apos;t convert existing prices.
        </Text>
        <FormSelect control={form.control} name="locale" label="Date and number format" options={LOCALES} />
      </Section>

      <Section
        title="Contact and address"
        description="Shown on your booking page and in confirmation emails."
      >
        <FormTextField
          control={form.control}
          name="contactEmail"
          label="Email (optional)"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <FormTextField
          control={form.control}
          name="contactPhone"
          label="Phone (optional)"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
        <FormTextField
          control={form.control}
          name="websiteUrl"
          label="Website (optional)"
          placeholder="https://"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="URL"
        />
        <FormTextField
          control={form.control}
          name="line1"
          label="Address line 1 (optional)"
          textContentType="streetAddressLine1"
        />
        <FormTextField
          control={form.control}
          name="line2"
          label="Address line 2 (optional)"
          textContentType="streetAddressLine2"
        />
        <FormTextField
          control={form.control}
          name="city"
          label="Town or city (optional)"
          textContentType="addressCity"
        />
        <FormTextField
          control={form.control}
          name="postcode"
          label="Postcode / Eircode (optional)"
          textContentType="postalCode"
          autoCapitalize="characters"
        />
      </Section>

      <FormRootError control={form.control} />
      <SaveBar
        dirty={isDirty}
        saving={isSubmitting}
        onSave={() => void submit()}
        onDiscard={() => form.reset(businessToGeneralValues(business))}
      />

      {perms.deleteBusiness ? (
        <Section
          title="Delete business"
          description={deleteBusinessDescription({ customers: v("customers"), bookings: v("bookings") })}
        >
          <Button
            testID="general-delete"
            variant="destructive"
            label={`Delete ${business.name}`}
            loading={remove.isPending}
            onPress={() => void deleteBusiness()}
          />
        </Section>
      ) : null}
    </SettingsPage>
  );
}

/** Whether the typed address is free (announced politely); nothing while it's the current one. */
function SlugStatus({ checking, available }: { checking: boolean; available: boolean | undefined }) {
  const { colors } = useTheme();
  if (checking) {
    return (
      <View style={styles.status} accessibilityLiveRegion="polite" accessibilityLabel="Checking the address">
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      </View>
    );
  }
  if (available === undefined) return null;
  return (
    <View
      style={styles.status}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={available ? "Address available" : "Address taken"}
      testID={available ? "slug-available" : "slug-taken"}
    >
      <Icon icon={available ? Check : CircleAlert} size={18} color={available ? "success" : "danger"} />
      <Text variant="footnote" tone={available ? "success" : "danger"}>
        {available ? "Available" : "Taken"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slug: { gap: space[1] },
  status: { flexDirection: "row", alignItems: "center", gap: space[1] },
  taken: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
});
