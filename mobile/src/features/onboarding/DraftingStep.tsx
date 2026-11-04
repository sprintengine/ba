import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Check, Sparkles } from "lucide-react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import { useTemplate } from "@shared/api/hooks/use-public";
import type { BusinessSetup } from "@shared/api/types";
import { Banner, Button, Card, Icon, Skeleton, Text, useTheme } from "~/ui";
import { FormScroll } from "~/ui/form";
import { radius, space } from "~/ui/tokens";

const STEPS = [
  "Reading your description",
  "Drafting services and prices",
  "Setting opening hours",
  "Writing booking questions",
] as const;

/** How long each step shows while the draft is being written (the last one waits for the response). */
export const STEP_MS = 1400;

/** Why drafting failed, in words for the owner. */
export function draftErrorMessage(error: unknown): string {
  if (isApiError(error) && error.code === "RATE_LIMITED")
    return "You've drafted a lot in a short time. Wait a minute and try again, or start from a template.";
  return errorMessage(error, "We couldn't draft your setup.");
}

/**
 * While `POST /v1/ai/business-draft` runs (the website's GeneratingState): the steps tick along on a timer, holding
 * on the last until the draft arrives. A failure offers Try again (same description) or going back to edit it.
 */
export function AiDrafting({
  description,
  error,
  onRetry,
  onBack,
}: {
  description: string;
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [active, setActive] = useState(0);
  const failed = error !== null && error !== undefined;

  useEffect(() => {
    if (failed) return;
    const id = setInterval(() => setActive((i) => Math.min(i + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(id);
  }, [failed]);

  const excerpt = description.length > 160 ? `${description.slice(0, 157).trimEnd()}…` : description;

  if (failed) {
    return (
      <FormScroll testID="onboarding-draft-error">
        <Headline
          title="We couldn't draft your setup"
          subtitle="Nothing was created. Your description is kept."
        />
        <Banner tone="danger">{draftErrorMessage(error)}</Banner>
        <View style={styles.actions}>
          <Button label="Try again" variant="brand" testID="onboarding-draft-retry" onPress={onRetry} />
          <Button
            label="Edit description"
            variant="secondary"
            testID="onboarding-draft-back"
            onPress={onBack}
          />
        </View>
      </FormScroll>
    );
  }

  return (
    <FormScroll testID="onboarding-drafting">
      <Headline
        title="Drafting your setup"
        subtitle="This usually takes a few seconds. You'll be able to change everything next."
      />
      <Card padding={0}>
        <View style={styles.quote}>
          <Text variant="callout" tone="muted">
            “{excerpt}”
          </Text>
        </View>
        <View style={styles.steps}>
          {STEPS.map((label, i) => (
            <StepRow
              key={label}
              label={label}
              state={i < active ? "done" : i === active ? "active" : "todo"}
            />
          ))}
        </View>
      </Card>
      <Ghost />
    </FormScroll>
  );
}

/** Loading a template the owner picked; a failure offers Try again or going back. */
export function TemplateLoading({
  templateKey,
  onLoaded,
  onBack,
}: {
  templateKey: string;
  onLoaded: (setup: BusinessSetup) => void;
  onBack: () => void;
}) {
  const template = useTemplate(templateKey, { retry: false });
  const data = template.data;

  useEffect(() => {
    if (data) onLoaded(data);
  }, [data, onLoaded]);

  if (template.isError) {
    return (
      <FormScroll testID="onboarding-template-error">
        <Headline title="We couldn't load that template" subtitle="Nothing was created." />
        <Banner tone="danger">
          {template.error.isNotFound
            ? `We couldn't find the "${templateKey}" template. Pick another or describe your business.`
            : errorMessage(template.error, "We couldn't load that template.")}
        </Banner>
        <View style={styles.actions}>
          <Button
            label="Try again"
            variant="brand"
            testID="onboarding-template-retry"
            onPress={() => void template.refetch()}
          />
          <Button label="Back" variant="secondary" testID="onboarding-template-back" onPress={onBack} />
        </View>
      </FormScroll>
    );
  }

  return (
    <FormScroll testID="onboarding-template-loading">
      <Headline title="Loading the template" subtitle="You'll be able to change everything next." />
      <Ghost />
    </FormScroll>
  );
}

function Headline({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.headline} accessibilityLiveRegion="polite">
      <View style={[styles.badge, { backgroundColor: colors.brand }]}>
        <Icon icon={Sparkles} color="brandForeground" />
      </View>
      <Text variant="title2">{title}</Text>
      <Text tone="muted">{subtitle}</Text>
    </View>
  );
}

function StepRow({ label, state }: { label: string; state: "done" | "active" | "todo" }) {
  const { colors } = useTheme();
  const status = state === "done" ? "done" : state === "active" ? "in progress" : "to do";
  return (
    <View
      style={[styles.step, state === "active" ? { backgroundColor: colors.accent } : null]}
      accessible
      accessibilityLabel={`${label}, ${status}`}
      testID={`onboarding-step-${state}`}
    >
      <View
        style={[
          styles.dot,
          state === "done"
            ? { backgroundColor: colors.brand, borderColor: colors.brand }
            : { borderColor: state === "active" ? colors.brandBorder : colors.border },
        ]}
      >
        {state === "done" ? <Icon icon={Check} size={14} color="brandForeground" strokeWidth={2.5} /> : null}
        {state === "active" ? <View style={[styles.pip, { backgroundColor: colors.brand }]} /> : null}
      </View>
      <Text
        variant="callout"
        tone={state === "todo" ? "subtle" : "default"}
        weight={state === "active" ? "medium" : undefined}
      >
        {label}
      </Text>
    </View>
  );
}

/** A ghost of the review page while it loads. */
function Ghost() {
  return (
    <View style={styles.ghost} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1].map((card) => (
        <Card key={card}>
          <View style={styles.ghostCard}>
            <Skeleton width="40%" height={18} />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} width={row === 1 ? "55%" : "75%"} height={14} />
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { gap: space[2], paddingTop: space[2] },
  badge: {
    width: space[12],
    height: space[12],
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[2],
  },
  quote: { paddingHorizontal: space[4], paddingVertical: space[3] },
  steps: { padding: space[2], gap: space[1] },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderRadius: radius.md,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
  },
  dot: {
    width: space[6],
    height: space[6],
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pip: { width: space[2], height: space[2], borderRadius: radius.full },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  ghost: { gap: space[3] },
  ghostCard: { gap: space[3] },
});
