import { StyleSheet, View } from "react-native";
import { Controller, useFormContext, useFormState } from "react-hook-form";
import { Lock } from "lucide-react-native";
import type { FormQuestion } from "@shared/api/types";
import type { NewBookingValues as Values } from "@shared/dashboard/new-booking";
import { Icon, Switch, Text, TextField } from "~/ui";
import { space } from "~/ui/tokens";
import { ChipRow } from "../fields";
import { Chip } from "../parts";

const KEYBOARD = {
  number: "decimal-pad",
  email: "email-address",
  phone: "phone-pad",
} as const;

/** The service's booking questions, all optional when staff book for someone (the website's step 4). */
export function QuestionsStep({ questions }: { questions: FormQuestion[] }) {
  const form = useFormContext<Values>();
  const { errors } = useFormState({ control: form.control, name: "answers" });
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <View style={styles.root}>
      <Text variant="callout" tone="muted">
        All optional when you book for someone. Fill in what you know.
      </Text>
      {sorted.map((q) => (
        <Controller
          key={q.id}
          control={form.control}
          name={`answers.${q.id}`}
          render={({ field }) => {
            const error = errors.answers?.[q.id]?.message;
            const label = q.label;
            const sensitive = q.sensitive ? (
              <View style={styles.sensitive}>
                <Icon icon={Lock} size={14} color="warningSoftForeground" />
                <Text variant="footnote" tone="warning">
                  Sensitive: never emailed or shared with AI
                </Text>
              </View>
            ) : null;
            if (q.kind === "checkbox") {
              return (
                <View>
                  <Switch
                    testID={`answer-${q.id}`}
                    label={label}
                    description={q.helpText ?? undefined}
                    value={field.value === "true"}
                    onValueChange={(c) => field.onChange(c ? "true" : "false")}
                  />
                  {sensitive}
                </View>
              );
            }
            if (q.kind === "select") {
              return (
                <View style={styles.field}>
                  <Text variant="callout" weight="medium">
                    {label}
                  </Text>
                  {q.helpText ? (
                    <Text variant="footnote" tone="subtle">
                      {q.helpText}
                    </Text>
                  ) : null}
                  <ChipRow accessibilityLabel={label} wrap>
                    {q.options.map((o) => (
                      <Chip
                        key={o}
                        role="radio"
                        label={o}
                        selected={field.value === o}
                        onPress={() => field.onChange(field.value === o ? "" : o)}
                      />
                    ))}
                  </ChipRow>
                  {sensitive}
                  {error ? (
                    <Text variant="footnote" tone="danger">
                      {error}
                    </Text>
                  ) : null}
                </View>
              );
            }
            return (
              <View style={styles.field}>
                <TextField
                  testID={`answer-${q.id}`}
                  label={label}
                  hint={q.helpText ?? undefined}
                  value={field.value ?? ""}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  multiline={q.kind === "textarea"}
                  keyboardType={q.kind in KEYBOARD ? KEYBOARD[q.kind as keyof typeof KEYBOARD] : "default"}
                  autoCapitalize={q.kind === "email" ? "none" : "sentences"}
                  error={error}
                />
                {sensitive}
              </View>
            );
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  field: { gap: space[1.5] },
  sensitive: { flexDirection: "row", alignItems: "center", gap: space[1] },
});
