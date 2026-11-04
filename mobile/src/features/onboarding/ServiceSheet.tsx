import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { BusinessSetup, PaymentMode } from "@shared/api/types";
import { PAYMENT_MODE_COPY, PAYMENT_MODES } from "@shared/catalog/services";
import type { SetupAction } from "@shared/onboarding/actions";
import { describeProblem } from "@shared/onboarding/problems";
import type { SetupErrors } from "@shared/onboarding/types";
import { Banner, Button, MoneyField, NumberField, Select, Sheet, Text, TextField } from "~/ui";
import { confirmAction } from "~/ui/form";
import { space } from "~/ui/tokens";
import { errorsUnder, serviceExtras } from "./wizard";

/** The number fields' value (their props also carry TextInput's own `onChange` type). */
const amount = (value: unknown): number | null => (typeof value === "number" ? value : null);

/** The fields this sheet edits; problems anywhere else in the service are listed under them. */
const EDITED = new Set(["name", "durationMinutes", "priceCents", "paymentMode", "depositCents"]);

/**
 * One service's essentials (the website's ServiceEditor, lighter): name, length, price and how customers pay.
 * Options, add-ons, who's needed and the rest are edited in Services once the business exists.
 */
export function ServiceSheet({
  index,
  onClose,
  setup,
  errors,
  dispatch,
}: {
  /** The service being edited, or null when the sheet is closed. */
  index: number | null;
  onClose: () => void;
  setup: BusinessSetup;
  errors: SetupErrors;
  dispatch: (action: SetupAction) => void;
}) {
  const service = index === null ? undefined : setup.services[index];
  const prefix = `services[${index}].`;
  const fieldErrors = Object.fromEntries(errorsUnder(errors, prefix));
  const others = errorsUnder(errors, prefix).filter(([field]) => !EDITED.has(field));
  const extras = service ? serviceExtras(service) : null;
  const update = (patch: Partial<BusinessSetup["services"][number]>) => {
    if (index !== null) dispatch({ type: "updateService", index, patch });
  };

  const remove = async () => {
    if (index === null || !service) return;
    const ok = await confirmAction({
      title: `Remove ${service.name.trim() || "this service"}?`,
      message: "You can add services again any time.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    onClose();
    dispatch({ type: "removeService", index });
  };

  return (
    <Sheet
      visible={!!service}
      onClose={onClose}
      title={service?.name.trim() || "Service"}
      testID="onboarding-service-sheet"
      footer={<Button label="Done" fullWidth testID="onboarding-service-done" onPress={onClose} />}
    >
      {service ? (
        <>
          <TextField
            label="Name"
            testID="onboarding-service-name"
            value={service.name}
            onChangeText={(name) => update({ name })}
            error={fieldErrors.name}
            maxLength={120}
          />
          <NumberField
            label="Duration"
            testID="onboarding-service-duration"
            unit="min"
            unitLabel="minutes"
            hint={service.options.length ? "Each option sets its own length." : undefined}
            value={service.durationMinutes}
            onChange={(minutes: unknown) => update({ durationMinutes: amount(minutes) ?? 0 })}
            error={fieldErrors.durationMinutes}
          />
          <Select<PaymentMode>
            label="Payment"
            testID="onboarding-service-payment"
            value={service.paymentMode}
            options={PAYMENT_MODES.map((m) => ({
              value: m,
              label: PAYMENT_MODE_COPY[m].label,
              description: PAYMENT_MODE_COPY[m].help,
            }))}
            error={fieldErrors.paymentMode}
            onChange={(paymentMode) => update({ paymentMode })}
          />
          {service.paymentMode === "free" ? null : (
            <MoneyField
              label="Price"
              testID="onboarding-service-price"
              currency={setup.currency}
              locale={setup.locale}
              hint={service.options.length ? "Each option sets its own price." : undefined}
              value={service.priceCents}
              onChange={(cents: unknown) => update({ priceCents: amount(cents) ?? 0 })}
              error={fieldErrors.priceCents}
            />
          )}
          {service.paymentMode === "deposit" ? (
            <MoneyField
              label="Deposit"
              testID="onboarding-service-deposit"
              currency={setup.currency}
              locale={setup.locale}
              value={service.depositCents}
              onChange={(cents: unknown) => update({ depositCents: amount(cents) })}
              error={fieldErrors.depositCents}
            />
          ) : null}
          {others.length > 0 ? (
            <Banner tone="warning" title="Also needs fixing" testID="onboarding-service-other-problems">
              <View style={styles.problems}>
                {others.map(([field, message]) => (
                  <Text key={field} variant="callout">
                    {describeProblem(setup, prefix + field, message).label}: {message}
                  </Text>
                ))}
                <Text variant="callout">
                  These can&apos;t be changed in the app yet. Remove the service and add it again later in
                  Services, or finish setting up on the website.
                </Text>
              </View>
            </Banner>
          ) : null}
          <Text variant="footnote" tone="subtle">
            {extras ? `Includes ${extras}. ` : ""}Options, add-ons, who&apos;s needed and booking rules can be
            changed in Services after you create your business.
          </Text>
          <Button
            label="Remove service"
            variant="ghost"
            icon={Trash2}
            testID="onboarding-service-remove"
            onPress={() => void remove()}
          />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  problems: { gap: space[1] },
});
