import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import type { Service } from "@shared/api/types";
import { defaultPaymentMode, type NewBookingValues as Values } from "@shared/dashboard/new-booking";
import { formatDuration } from "@shared/format";
import { Checkbox, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { ChoiceRow } from "../fields";
import { useFmt } from "../fmt";
import { Chip, ColorDot } from "../parts";

/** Services by category (in their order), for the list of choices. */
export function servicesByCategory(services: readonly Service[]): [string, Service[]][] {
  const map = new Map<string, Service[]>();
  for (const s of [...services].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
    const key = s.category?.trim() || "Services";
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()];
}

/**
 * Step 1: the service (by category), then its option and add-ons. Changing any of them clears the chosen time, as on
 * the website; choosing a service sets the payment to what suits it.
 */
export function ServiceStep({ services, service }: { services: Service[]; service: Service | undefined }) {
  const fmt = useFmt();
  const form = useFormContext<Values>();
  const [optionId, addonIds] = useWatch({ control: form.control, name: ["optionId", "addonIds"] });
  const [choosing, setChoosing] = useState(!service);
  // useFormState (not form.formState): subscribes this component, which the React Compiler would otherwise memoise.
  const { errors } = useFormState({ control: form.control, name: ["serviceId", "optionId"] });
  const error = errors.serviceId?.message;
  const optionError = errors.optionId?.message;
  const groups = servicesByCategory(services);

  const choose = (s: Service) => {
    form.setValue("serviceId", s.id, { shouldValidate: !!error });
    form.setValue("optionId", s.options.length === 1 ? (s.options[0]?.id ?? null) : null);
    form.setValue("addonIds", []);
    form.setValue("slotStart", null);
    form.setValue("paymentMode", defaultPaymentMode(s));
    setChoosing(false);
  };

  return (
    <View style={styles.root}>
      {service && !choosing ? (
        <View style={styles.chosen}>
          <View style={styles.flex}>
            <ChoiceRow
              testID="service-chosen"
              title={service.name}
              detail={`${formatDuration(service.durationMinutes)}${service.isPublic ? "" : " · private"}`}
              leading={<ColorDot color={service.color} />}
              selected
              onPress={() => setChoosing(true)}
            />
          </View>
          <Chip label="Change" onPress={() => setChoosing(true)} accessibilityLabel="Change service" />
        </View>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="Service" style={styles.list}>
          {groups.map(([category, list]) => (
            <View key={category} style={styles.list}>
              {groups.length > 1 ? (
                <Text variant="footnote" tone="subtle">
                  {category}
                </Text>
              ) : null}
              {list.map((s) => (
                <ChoiceRow
                  key={s.id}
                  testID={`service-${s.id}`}
                  title={s.name}
                  detail={`${formatDuration(s.durationMinutes)}${s.isPublic ? "" : " · private"}`}
                  leading={<ColorDot color={s.color} />}
                  selected={s.id === service?.id}
                  onPress={() => choose(s)}
                />
              ))}
            </View>
          ))}
        </View>
      )}
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {service && service.options.length > 0 ? (
        <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Option">
          <Text variant="callout" weight="medium">
            Option
          </Text>
          {service.options.map((o) => (
            <ChoiceRow
              key={o.id}
              testID={`option-${o.id}`}
              title={o.name}
              detail={formatDuration(o.durationMinutes)}
              aside={fmt.price(o.priceCents)}
              selected={o.id === optionId}
              onPress={() => {
                form.setValue("optionId", o.id);
                form.clearErrors("optionId");
                form.setValue("slotStart", null);
              }}
            />
          ))}
          {optionError ? (
            <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
              {optionError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {service && service.addons.length > 0 ? (
        <View style={styles.list}>
          <Text variant="callout" weight="medium">
            Add-ons{" "}
            <Text variant="callout" tone="subtle">
              (optional)
            </Text>
          </Text>
          {service.addons.map((a) => {
            const checked = addonIds.includes(a.id);
            const extra = a.extraMinutes ? ` · +${formatDuration(a.extraMinutes)}` : "";
            return (
              <Checkbox
                key={a.id}
                testID={`addon-${a.id}`}
                label={`${a.name}${extra}`}
                description={a.priceCents ? fmt.money(a.priceCents, { signed: true }) : "Free"}
                checked={checked}
                onChange={(c) => {
                  form.setValue("addonIds", c ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id));
                  form.setValue("slotStart", null);
                }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  list: { gap: space[2] },
  chosen: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flex: { flex: 1 },
});
