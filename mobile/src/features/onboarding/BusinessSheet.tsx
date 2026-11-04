import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Check, CircleAlert, RotateCcw } from "lucide-react-native";
import type { BusinessSetup } from "@shared/api/types";
import { CURRENCIES } from "@shared/catalog/currencies";
import {
  browserTimeZone,
  COMMON_TIME_ZONES,
  isValidTimeZone,
  supportedTimeZones,
  timeZoneOptions,
} from "@shared/format";
import type { SetupAction } from "@shared/onboarding/actions";
import type { SetupErrors } from "@shared/onboarding/types";
import { env } from "~/config/env";
import { Button, Icon, SearchSelect, Select, Sheet, Text, TextField, useTheme } from "~/ui";
import { space } from "~/ui/tokens";
import type { SlugCheck } from "./use-setup-validation";

/** The host booking pages are shown on ("bookanything.ie"). */
export function publicHost(): string {
  return (env.webUrl || "https://bookanything.ie").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * The business's essentials (the website's BusinessSection, lighter): name, booking page address with a live
 * availability check, description, timezone and currency. Edits apply to the draft as they're made.
 */
export function BusinessSheet({
  visible,
  onClose,
  setup,
  slugEdited,
  slugCheck,
  errors,
  dispatch,
}: {
  visible: boolean;
  onClose: () => void;
  setup: BusinessSetup;
  slugEdited: boolean;
  slugCheck: SlugCheck;
  errors: SetupErrors;
  dispatch: (action: SetupAction) => void;
}) {
  const device = browserTimeZone();
  const [zones] = useState(() =>
    timeZoneOptions(
      [setup.timezone, device, ...COMMON_TIME_ZONES, ...supportedTimeZones()].filter((z): z is string => !!z),
    ),
  );
  const currencies = CURRENCIES.some((c) => c.code === setup.currency)
    ? CURRENCIES
    : [{ code: setup.currency, name: setup.currency }, ...CURRENCIES];
  const slug = setup.slug ?? "";
  const host = publicHost();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Your business"
      testID="onboarding-business-sheet"
      footer={<Button label="Done" fullWidth testID="onboarding-business-done" onPress={onClose} />}
    >
      <TextField
        label="Business name"
        testID="onboarding-business-name"
        value={setup.name}
        onChangeText={(name) => dispatch({ type: "setName", name })}
        error={errors.name}
        maxLength={100}
        autoComplete="organization"
        textContentType="organizationName"
      />
      <View style={styles.slug}>
        <TextField
          label="Booking page address"
          testID="onboarding-business-slug"
          value={slug}
          onChangeText={(text) => dispatch({ type: "setSlug", slug: text })}
          error={errors.slug}
          hint={
            slugCheck.status === "unknown"
              ? "We couldn't check availability right now. We'll confirm when you create."
              : `${host}/${slug || "…"}`
          }
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <SlugStatus check={slugCheck} hasError={!!errors.slug} />
        <View style={styles.slugActions}>
          {slugCheck.status === "taken" && slugCheck.suggestion ? (
            <Button
              size="sm"
              variant="secondary"
              testID="onboarding-slug-suggestion"
              label={`Use ${slugCheck.suggestion}`}
              onPress={() => dispatch({ type: "setSlug", slug: slugCheck.suggestion ?? "" })}
            />
          ) : null}
          {slugEdited ? (
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              testID="onboarding-slug-reset"
              label="Match business name"
              onPress={() => dispatch({ type: "resetSlug" })}
            />
          ) : null}
        </View>
      </View>
      <TextField
        label="Short description (optional)"
        hint="Shown at the top of your booking page."
        testID="onboarding-business-description"
        value={setup.description ?? ""}
        onChangeText={(description) => dispatch({ type: "updateBusiness", patch: { description } })}
        error={errors.description}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={2000}
      />
      <SearchSelect
        label="Timezone"
        testID="onboarding-business-timezone"
        value={setup.timezone}
        options={zones}
        searchPlaceholder="Search cities…"
        hint="Opening hours and bookings use this timezone."
        error={errors.timezone}
        onChange={(timezone) => dispatch({ type: "updateBusiness", patch: { timezone } })}
        custom={(query) =>
          isValidTimeZone(query)
            ? { value: query, label: query.replace(/_/g, " "), hint: "Use this timezone" }
            : null
        }
      />
      {device && device !== setup.timezone && isValidTimeZone(device) ? (
        <Button
          size="sm"
          variant="ghost"
          testID="onboarding-use-device-timezone"
          label={`Use this phone's timezone (${device.replace(/_/g, " ")})`}
          onPress={() => dispatch({ type: "updateBusiness", patch: { timezone: device } })}
        />
      ) : null}
      <Select
        label="Currency"
        testID="onboarding-business-currency"
        value={setup.currency}
        options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
        error={errors.currency}
        onChange={(currency) => dispatch({ type: "updateBusiness", patch: { currency } })}
      />
      <Text variant="footnote" tone="subtle">
        Prices use this currency. Changing it doesn&apos;t convert the prices in this draft.
      </Text>
    </Sheet>
  );
}

/** Whether the address is free (announced politely). */
function SlugStatus({ check, hasError }: { check: SlugCheck; hasError: boolean }) {
  const { colors } = useTheme();
  if (check.status === "checking") {
    return (
      <View
        style={styles.status}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel="Checking the address"
        testID="onboarding-slug-checking"
      >
        <ActivityIndicator size="small" color={colors.mutedForeground} />
        <Text variant="footnote" tone="muted">
          Checking…
        </Text>
      </View>
    );
  }
  if (check.status === "available" && !hasError) {
    return (
      <View
        style={styles.status}
        accessible
        accessibilityLiveRegion="polite"
        testID="onboarding-slug-available"
      >
        <Icon icon={Check} size={16} color="success" />
        <Text variant="footnote" tone="success">
          Available
        </Text>
      </View>
    );
  }
  if (check.status === "taken") {
    return (
      <View style={styles.status} accessible accessibilityLiveRegion="polite" testID="onboarding-slug-taken">
        <Icon icon={CircleAlert} size={16} color="danger" />
        <Text variant="footnote" tone="danger">
          Taken
        </Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  slug: { gap: space[1.5] },
  slugActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  status: { flexDirection: "row", alignItems: "center", gap: space[1] },
});
