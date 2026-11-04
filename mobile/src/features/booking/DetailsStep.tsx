import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Controller, type Control } from "react-hook-form";
import { Lock, UserRound } from "lucide-react-native";
import type { DetailsValues, Question } from "@shared/booking/details-schema";
import { Badge, Button, Checkbox, Divider, Icon, Select, Text, TextField, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import type { DetailsForm } from "./use-booking-flow";

/**
 * "Your details": name, email and phone (prefilled from the account), the service's questions (sensitive ones marked
 * private) and notes. Validated with the website's schema; the step's action (Review) submits it.
 */
export function DetailsStep({ details, businessName }: { details: DetailsForm; businessName: string }) {
  const { colors } = useTheme();
  const { form, questions, requirePhone, signedInAs } = details;
  const control = form.control;
  return (
    <View style={styles.root} testID="details-step">
      {signedInAs ? (
        <View
          style={[styles.signedIn, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
        >
          <Icon icon={UserRound} size={16} color="subtleForeground" />
          <Text variant="callout" tone="muted" style={styles.flex} numberOfLines={2}>
            Booking as{" "}
            <Text variant="callout" weight="medium">
              {signedInAs.name || signedInAs.email}
            </Text>
            {signedInAs.name ? ` · ${signedInAs.email}` : ""}
          </Text>
        </View>
      ) : (
        <View style={styles.signIn}>
          <Text variant="callout" tone="muted" style={styles.flex}>
            Have an account? Sign in to keep all your bookings in one place.
          </Text>
          <Button variant="secondary" size="sm" label="Sign in" onPress={() => router.push("/sign-in")} />
        </View>
      )}

      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            testID="details-name"
            label="Full name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoComplete="name"
            textContentType="name"
            placeholder="Alex Morgan"
            returnKeyType="next"
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            testID="details-email"
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            hint="We'll send your confirmation and a link to manage it here."
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            testID="details-phone"
            label={requirePhone ? "Phone" : "Phone (optional)"}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            hint={
              requirePhone
                ? `${businessName} may call if something changes.`
                : "For reminders or if plans change."
            }
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="+353 87 123 4567"
          />
        )}
      />

      {questions.length > 0 ? (
        <>
          <Divider />
          {questions.map((q) => (
            <QuestionField key={q.id} question={q} control={control} businessName={businessName} />
          ))}
        </>
      ) : null}

      <Divider />
      <Controller
        control={control}
        name="notes"
        render={({ field, fieldState }) => (
          <TextField
            testID="details-notes"
            label={`Anything ${businessName} should know? (optional)`}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            placeholder="Access notes, preferences…"
            multiline
            numberOfLines={3}
          />
        )}
      />
    </View>
  );
}

function QuestionField({
  question: q,
  control,
  businessName,
}: {
  question: Question;
  control: Control<DetailsValues>;
  businessName: string;
}) {
  const help = [q.helpText, q.sensitive ? `Only shared with ${businessName}.` : null]
    .filter(Boolean)
    .join(" ");
  const label = `${q.label}${q.required ? "" : " (optional)"}`;
  const name = `answers.${q.id}` as const;
  return (
    <View style={styles.question}>
      {q.sensitive ? (
        <View style={styles.private}>
          <Icon icon={Lock} size={12} color="mutedForeground" />
          <Badge label="Private" />
        </View>
      ) : null}
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => {
          const value = field.value ?? "";
          const error = fieldState.error?.message;
          switch (q.kind) {
            case "checkbox":
              return (
                <View style={styles.checkbox}>
                  <Checkbox
                    testID={`question-${q.id}`}
                    label={label}
                    description={help || undefined}
                    checked={value === "true"}
                    onChange={(checked) => {
                      field.onChange(checked ? "true" : "false");
                      field.onBlur();
                    }}
                  />
                  {error ? (
                    <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
                      {error}
                    </Text>
                  ) : null}
                </View>
              );
            case "select":
              return (
                <View style={styles.checkbox}>
                  <Select
                    testID={`question-${q.id}`}
                    label={label}
                    value={value || null}
                    options={q.options.map((o) => ({ value: o, label: o }))}
                    onChange={(v) => {
                      field.onChange(v);
                      field.onBlur();
                    }}
                    error={error}
                  />
                  {help && !error ? (
                    <Text variant="footnote" tone="subtle">
                      {help}
                    </Text>
                  ) : null}
                </View>
              );
            default:
              return (
                <TextField
                  testID={`question-${q.id}`}
                  label={label}
                  value={value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={error}
                  hint={help || undefined}
                  multiline={q.kind === "textarea"}
                  numberOfLines={q.kind === "textarea" ? 3 : undefined}
                  keyboardType={
                    q.kind === "email"
                      ? "email-address"
                      : q.kind === "phone"
                        ? "phone-pad"
                        : q.kind === "number"
                          ? "decimal-pad"
                          : "default"
                  }
                  autoCapitalize={q.kind === "email" ? "none" : "sentences"}
                />
              );
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[5] },
  signedIn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  signIn: { flexDirection: "row", alignItems: "center", gap: space[3] },
  flex: { flex: 1 },
  question: { gap: space[1.5] },
  private: { flexDirection: "row", alignItems: "center", gap: space[1] },
  checkbox: { gap: space[1] },
});
