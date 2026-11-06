import { StyleSheet, View } from "react-native";
import { Controller, useFormContext, useFormState } from "react-hook-form";
import { Banknote, CircleSlash, CreditCard } from "lucide-react-native";
import type { Service } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { isPricedService, type NewBookingValues as Values } from "@shared/dashboard/new-booking";
import { useVocabulary } from "@shared/vocabulary";
import { Switch, Text, TextField } from "~/ui";
import { space } from "~/ui/tokens";
import { ChoiceRow } from "../fields";

/** Last step: how it's paid (online only when priced and payments are connected), the email, internal notes. */
export function PaymentStep({ service }: { service: Service | undefined }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const form = useFormContext<Values>();
  const { errors } = useFormState({ control: form.control, name: "paymentMode" });
  // Until a service is chosen nothing is ruled out.
  const unpriced = !!service && !isPricedService(service);
  return (
    <View style={styles.root}>
      <Controller
        control={form.control}
        name="paymentMode"
        render={({ field }) => (
          <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Payment">
            <Text variant="callout" weight="medium">
              Payment
            </Text>
            <ChoiceRow
              testID="payment-collect_online"
              icon={CreditCard}
              title="Online"
              detail={business.paymentsEnabled ? "Held until paid" : "Connect payments first"}
              disabled={unpriced || !business.paymentsEnabled}
              selected={field.value === "collect_online"}
              onPress={() => field.onChange("collect_online")}
            />
            <ChoiceRow
              testID="payment-at_venue"
              icon={Banknote}
              title="At venue"
              detail="Pay on the day"
              disabled={unpriced}
              selected={field.value === "at_venue"}
              onPress={() => field.onChange("at_venue")}
            />
            <ChoiceRow
              testID="payment-none"
              icon={CircleSlash}
              title="Free"
              detail="Nothing to pay"
              selected={field.value === "none"}
              onPress={() => field.onChange("none")}
            />
            {errors.paymentMode?.message ? (
              <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
                {errors.paymentMode.message}
              </Text>
            ) : null}
          </View>
        )}
      />
      <Controller
        control={form.control}
        name="notifyCustomer"
        render={({ field }) => (
          <Switch
            testID="notify-customer"
            label={`Email the ${v("customer")}`}
            description="Confirmation with a link to manage it."
            value={field.value}
            onValueChange={field.onChange}
          />
        )}
      />
      <Controller
        control={form.control}
        name="internalNotes"
        render={({ field }) => (
          <TextField
            label="Internal notes (optional)"
            placeholder="Only your team sees these."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            multiline
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  list: { gap: space[2] },
});
