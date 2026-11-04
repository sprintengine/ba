import { useWatch, type UseFormReturn } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ArrowRight, Sparkles } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useMe } from "@shared/api/hooks/use-me";
import { useTemplates } from "@shared/api/hooks/use-public";
import { Button, Card, Icon, ListRow, Skeleton, Text, useTheme } from "~/ui";
import { FormScroll, FormTextField } from "~/ui/form";
import { radius, space } from "~/ui/tokens";
import { templateIcon } from "./template-icon";
import { EXAMPLES, type DescribeValues } from "./wizard";

const GENERIC = "generic";

/**
 * The first step (the website's start and describe steps in one screen): name the business and say what it does
 * for an AI draft, or start from a template. Nothing is created until the owner reviews it.
 */
export function DescribeStep({
  form,
  onDraft,
  onPickTemplate,
}: {
  form: UseFormReturn<DescribeValues>;
  onDraft: (values: DescribeValues) => void;
  onPickTemplate: (key: string) => void;
}) {
  const me = useMe();
  const description = useWatch({ control: form.control, name: "description" });
  const firstName = me.data?.user.name?.trim().split(/\s+/)[0];
  const submit = form.handleSubmit(onDraft);

  return (
    <FormScroll testID="onboarding-describe">
      <View style={styles.header}>
        <Text variant="callout" tone="brand" weight="medium">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </Text>
        <Text variant="title1">Set up your business</Text>
        <Text tone="muted">
          Tell us what you do and we&apos;ll draft your services, prices and opening hours. You review
          everything before anything is created.
        </Text>
      </View>

      <FormTextField
        control={form.control}
        name="name"
        label="Business name"
        hint="Optional. You can change it on the next step."
        testID="onboarding-name"
        placeholder="Lumen Physiotherapy"
        autoComplete="organization"
        textContentType="organizationName"
        returnKeyType="next"
      />
      <FormTextField
        control={form.control}
        name="description"
        label="What do you do?"
        hint="What people book, how long it takes, what it costs and when you're open. Plain words are perfect."
        testID="onboarding-description"
        placeholder="We're a two-bay car wash in Galway, open Mon–Sat 8–6, valets from €40…"
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />
      <View style={styles.examples}>
        <Text variant="footnote" tone="subtle">
          Need inspiration? Try an example
        </Text>
        <View style={styles.exampleRow}>
          {EXAMPLES.map((ex) => (
            <Button
              key={ex.label}
              label={ex.label}
              accessibilityLabel={`Use the ${ex.label.toLowerCase()} example`}
              accessibilityState={{ selected: description === ex.text }}
              size="sm"
              variant={description === ex.text ? "primary" : "secondary"}
              testID={`onboarding-example-${ex.label}`}
              onPress={() =>
                form.setValue("description", ex.text, {
                  shouldDirty: true,
                  shouldValidate: form.formState.isSubmitted,
                })
              }
            />
          ))}
        </View>
      </View>
      <FormTextField
        control={form.control}
        name="websiteUrl"
        label="Your website (optional)"
        hint="If you have one, we'll use it for context."
        testID="onboarding-website"
        placeholder="example.ie"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="URL"
      />
      <Button
        testID="onboarding-draft"
        label="Draft my setup"
        variant="brand"
        size="lg"
        icon={Sparkles}
        fullWidth
        onPress={() => void submit()}
      />

      <Templates onPick={onPickTemplate} />
    </FormScroll>
  );
}

/** "Or start from a template": the website's template cards as a list, and a blank setup. */
function Templates({ onPick }: { onPick: (key: string) => void }) {
  const templates = useTemplates();
  const { colors } = useTheme();
  const generic = templates.data?.find((t) => t.key === GENERIC);
  const list = templates.data?.filter((t) => t.key !== GENERIC) ?? [];

  return (
    <View style={styles.templates}>
      <View style={styles.divider}>
        <Text variant="callout" tone="muted" weight="medium">
          Or start from a template
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
      </View>
      {templates.isPending ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading templates"
          style={styles.loading}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} radius="lg" />
          ))}
        </View>
      ) : templates.isError ? (
        <View style={styles.list}>
          <Text variant="callout" tone="muted">
            {errorMessage(templates.error, "We couldn't load the templates.")} You can still describe your
            business above.
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            testID="onboarding-templates-retry"
            onPress={() => void templates.refetch()}
          />
        </View>
      ) : (
        <Card padding={0}>
          {list.map((t) => (
            <ListRow
              key={t.key}
              testID={`onboarding-template-${t.key}`}
              leading={
                <View style={[styles.templateIcon, { backgroundColor: colors.muted }]}>
                  <Icon icon={templateIcon(t.icon)} size={18} color="mutedForeground" />
                </View>
              }
              title={t.name}
              subtitle={t.description}
              onPress={() => onPick(t.key)}
            />
          ))}
          {generic ? (
            <ListRow
              testID={`onboarding-template-${GENERIC}`}
              icon={ArrowRight}
              title="Something else?"
              subtitle="Start from a simple, blank setup"
              onPress={() => onPick(generic.key)}
            />
          ) : null}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[2], paddingTop: space[2] },
  examples: { gap: space[2], marginTop: -space[2] },
  exampleRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  templates: { gap: space[3], paddingTop: space[4] },
  divider: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  list: { gap: space[2], alignItems: "flex-start" },
  loading: { gap: space[2] },
  templateIcon: {
    width: space[10],
    height: space[10],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
