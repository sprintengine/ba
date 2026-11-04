import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleAlert, CircleCheck, Plus, RotateCcw, Sparkles } from "lucide-react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import { useMe } from "@shared/api/hooks/use-me";
import { useCreateBusiness } from "@shared/api/hooks/use-onboarding";
import { useTemplates } from "@shared/api/hooks/use-public";
import { qk } from "@shared/api/query-keys";
import type { BusinessSetup } from "@shared/api/types";
import { durationLabel, priceLabel } from "@shared/booking/quote";
import { PAYMENT_MODE_COPY } from "@shared/catalog/services";
import type { SetupAction } from "@shared/onboarding/actions";
import { createdBusinessIn, toCreateInput } from "@shared/onboarding/draft";
import { summarizeHours } from "@shared/onboarding/hours";
import type { SetupProblem } from "@shared/onboarding/problems";
import { nextResource } from "@shared/onboarding/reducers/resources";
import type { SetupDraft, SetupErrors } from "@shared/onboarding/types";
import { Badge, Banner, Button, Icon, ListRow, Section, Text, useTheme } from "~/ui";
import { confirmAction, FormScroll, hapticError } from "~/ui/form";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { BusinessSheet, publicHost } from "./BusinessSheet";
import { ResourceSheet } from "./ResourceSheet";
import { ServiceSheet } from "./ServiceSheet";
import { useSetupValidation, type SlugCheck } from "./use-setup-validation";
import { alsoIncluded, fixTarget, problemCount, type CreatedBusiness, type DraftOrigin } from "./wizard";

type Open = { sheet: "business" } | { sheet: "service"; index: number } | { sheet: "resource"; key: string };

/**
 * Review the essentials before creating (the website's ReviewStep, lighter): the business, its services and its
 * resources with their hours, each edited in a sheet. Everything else (options, questions, groups, wording) comes
 * from the draft as it is and is edited in the dashboard afterwards. Problems block Create and open what to fix.
 */
export function ReviewStep({
  draft,
  origin,
  dispatch: rawDispatch,
  onStartOver,
  onCreated,
}: {
  draft: SetupDraft;
  origin: DraftOrigin;
  dispatch: (action: SetupAction) => void;
  onStartOver: () => void;
  onCreated: (business: CreatedBusiness) => void;
}) {
  const setup = draft.setup;
  const [serverErrors, setServerErrors] = useState<SetupErrors>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const queryClient = useQueryClient();
  const create = useCreateBusiness();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // The businesses the owner had before creating this one, to recognise it if a create's response is lost.
  const knownBusinessIds = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!knownBusinessIds.current && me.data)
      knownBusinessIds.current = new Set(me.data.memberships.map((m) => m.businessId));
  }, [me.data]);

  const dispatch = (action: SetupAction) => {
    rawDispatch(action);
    setServerErrors({});
    setRootError(null);
  };

  const { errors, problems, slugCheck } = useSetupValidation(setup, serverErrors);
  const [firstProblem] = problems;

  const jumpTo = (problem: SetupProblem) => {
    const target = fixTarget(problem, setup);
    if (target.sheet) setOpen(target);
  };

  /** The business an earlier create made although its response never arrived, from a fresh /v1/me. */
  const createdEarlier = async () => {
    const known = knownBusinessIds.current;
    if (!known) return null;
    const { data } = await me.refetch();
    return data ? createdBusinessIn(data, known, toCreateInput(setup).slug) : null;
  };

  const submit = async () => {
    setRootError(null);
    if (firstProblem) {
      hapticError();
      jumpTo(firstProblem);
      return;
    }
    try {
      const business = await create.mutateAsync(toCreateInput(setup));
      onCreated({ id: business.id, slug: business.slug, name: business.name });
    } catch (err) {
      // A retry after a lost response finds the address taken by the business that response was for.
      const lost = isApiError(err) && (err.code === "SLUG_TAKEN" || err.isUnavailable);
      const created = lost ? await createdEarlier() : null;
      hapticError();
      if (created) {
        onCreated({ id: created.businessId, slug: created.slug, name: created.name });
      } else if (isApiError(err) && err.code === "SLUG_TAKEN") {
        setServerErrors({ slug: err.fields.slug ?? "That address was just taken. Try another." });
        void queryClient.invalidateQueries({ queryKey: qk.onboarding.slugAvailable(setup.slug ?? "") });
        setOpen({ sheet: "business" });
      } else if (isApiError(err) && Object.keys(err.fields).length > 0) {
        setServerErrors(err.fields);
        setRootError(err.message);
      } else {
        setRootError(errorMessage(err));
      }
    }
  };

  const startOver = async () => {
    const ok = await confirmAction({
      title: "Start over?",
      message: "This draft and your edits will be discarded.",
      confirmLabel: "Discard draft",
      destructive: true,
    });
    if (ok) onStartOver();
  };

  const addService = () => {
    dispatch({ type: "addService" });
    setOpen({ sheet: "service", index: setup.services.length });
  };

  const addResource = () => {
    const { key } = nextResource(setup);
    dispatch({ type: "addResource" });
    setOpen({ sheet: "resource", key });
  };

  const v = setup.vocabulary;
  const extras = alsoIncluded(setup);

  return (
    <View style={styles.fill}>
      <FormScroll width="content" testID="onboarding-review">
        <View style={styles.header}>
          <SourceNote setup={setup} origin={origin} />
          <Text variant="title1">Review your business</Text>
          <Text tone="muted">
            Check the essentials, then create it. You can fine-tune services, staff and hours any time from
            Services and Resources in your dashboard.
          </Text>
        </View>

        {problems.length > 0 ? (
          <Problems problems={problems} setup={setup} onFix={jumpTo} dispatch={dispatch} />
        ) : null}

        <Section
          title="Your business"
          description="The name and address customers see."
          testID="onboarding-review-business"
        >
          <View style={styles.rows}>
            <ListRow
              testID="onboarding-review-name"
              title={setup.name.trim() || "Add a business name"}
              subtitle={errors.name ?? "Business name"}
              trailing={errors.name ? <Icon icon={CircleAlert} color="danger" /> : undefined}
              onPress={() => setOpen({ sheet: "business" })}
            />
            <ListRow
              testID="onboarding-review-slug"
              title={`${publicHost()}/${setup.slug ?? ""}`}
              subtitle={errors.slug ?? slugSubtitle(slugCheck)}
              trailing={errors.slug ? <Icon icon={CircleAlert} color="danger" /> : undefined}
              onPress={() => setOpen({ sheet: "business" })}
            />
            <ListRow
              testID="onboarding-review-region"
              title={`${setup.timezone.replace(/_/g, " ")} · ${setup.currency}`}
              subtitle={errors.timezone ?? errors.currency ?? "Timezone and currency"}
              trailing={
                errors.timezone || errors.currency ? <Icon icon={CircleAlert} color="danger" /> : undefined
              }
              onPress={() => setOpen({ sheet: "business" })}
            />
          </View>
        </Section>

        <Section
          title="Services"
          description={
            setup.services.length === 0
              ? "Add at least one service so customers have something to book."
              : "What customers can book."
          }
          action={
            <Button
              label="Add"
              size="sm"
              variant="secondary"
              icon={Plus}
              accessibilityLabel="Add a service"
              testID="onboarding-add-service"
              onPress={addService}
            />
          }
          testID="onboarding-review-services"
        >
          {setup.services.length > 0 ? (
            <View style={styles.rows}>
              {setup.services.map((s, i) => {
                const invalid = Object.keys(errors).some((k) => k.startsWith(`services[${i}].`));
                const meta = [
                  durationLabel(s),
                  priceLabel(s, setup.currency, { locale: setup.locale }),
                  PAYMENT_MODE_COPY[s.paymentMode].short,
                ].join(" · ");
                return (
                  <ListRow
                    key={i}
                    testID={`onboarding-service-${i}`}
                    leading={<View style={[styles.dot, { backgroundColor: s.color }]} />}
                    title={s.name.trim() || "Unnamed service"}
                    subtitle={invalid ? `Needs attention · ${meta}` : meta}
                    trailing={invalid ? <Icon icon={CircleAlert} color="danger" /> : undefined}
                    onPress={() => setOpen({ sheet: "service", index: i })}
                  />
                );
              })}
            </View>
          ) : null}
        </Section>

        <Section
          title={v.resources}
          description={`Who or what is booked, and when each is available.`}
          action={
            <Button
              label="Add"
              size="sm"
              variant="secondary"
              icon={Plus}
              accessibilityLabel={`Add ${article(v.resource)} ${v.resource.toLowerCase()}`}
              testID="onboarding-add-resource"
              onPress={addResource}
            />
          }
          testID="onboarding-review-resources"
        >
          {setup.resources.length > 0 ? (
            <View style={styles.rows}>
              {setup.resources.map((r, i) => {
                const invalid = Object.keys(errors).some((k) => k.startsWith(`resources[${i}].`));
                const hours = summarizeHours(r.weeklyHours);
                return (
                  <ListRow
                    key={r.key}
                    testID={`onboarding-resource-${r.key}`}
                    title={r.name.trim() || `Unnamed ${v.resource.toLowerCase()}`}
                    subtitle={invalid ? `Needs attention · ${hours}` : hours}
                    trailing={invalid ? <Icon icon={CircleAlert} color="danger" /> : undefined}
                    onPress={() => setOpen({ sheet: "resource", key: r.key })}
                  />
                );
              })}
            </View>
          ) : null}
        </Section>

        {extras ? (
          <Text variant="footnote" tone="subtle" testID="onboarding-also-included">
            Also included: {extras}. Change them in Settings after you create your business.
          </Text>
        ) : null}

        <Button
          label="Start over"
          variant="ghost"
          icon={RotateCcw}
          testID="onboarding-start-over"
          onPress={() => void startOver()}
        />
      </FormScroll>

      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, space[3]),
          },
        ]}
      >
        {rootError ? (
          <Banner tone="danger" testID="onboarding-create-error">
            {rootError}
          </Banner>
        ) : null}
        <View style={styles.barRow}>
          {firstProblem ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${problemCount(problems.length)}. Show the first`}
              testID="onboarding-problem-count"
              onPress={() => jumpTo(firstProblem)}
              style={styles.status}
            >
              <Icon icon={CircleAlert} size={18} color="danger" />
              <Text variant="callout" tone="danger" weight="medium" style={styles.statusText}>
                {problemCount(problems.length)}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.status}>
              <Icon icon={CircleCheck} size={18} color="success" />
              <Text variant="callout" tone="muted" style={styles.statusText}>
                Ready to create
              </Text>
            </View>
          )}
          <Button
            label="Create business"
            variant="brand"
            testID="onboarding-create"
            loading={create.isPending}
            onPress={() => void submit()}
          />
        </View>
      </View>

      <BusinessSheet
        visible={open?.sheet === "business"}
        onClose={() => setOpen(null)}
        setup={setup}
        slugEdited={draft.slugEdited}
        slugCheck={slugCheck}
        errors={errors}
        dispatch={dispatch}
      />
      <ServiceSheet
        index={open?.sheet === "service" ? open.index : null}
        onClose={() => setOpen(null)}
        setup={setup}
        errors={errors}
        dispatch={dispatch}
      />
      <ResourceSheet
        resourceKey={open?.sheet === "resource" ? open.key : null}
        onClose={() => setOpen(null)}
        setup={setup}
        errors={errors}
        dispatch={dispatch}
      />
    </View>
  );
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

function slugSubtitle(check: SlugCheck): string {
  switch (check.status) {
    case "checking":
      return "Booking page address · checking…";
    case "available":
      return "Booking page address · available";
    case "unknown":
      return "Booking page address · we'll confirm it when you create";
    default:
      return "Booking page address";
  }
}

/** What blocks Create, each opening where it's fixed (or removing what the app can't edit). */
function Problems({
  problems,
  setup,
  onFix,
  dispatch,
}: {
  problems: SetupProblem[];
  setup: BusinessSetup;
  onFix: (problem: SetupProblem) => void;
  dispatch: (action: SetupAction) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.problemBox, { backgroundColor: colors.dangerSoft, borderColor: colors.border }]}>
      <View style={styles.problemTitle}>
        <Icon icon={CircleAlert} size={18} color="dangerSoftForeground" />
        <Text variant="callout" weight="semibold" style={{ color: colors.dangerSoftForeground }}>
          Before you create: {problemCount(problems.length)}
        </Text>
      </View>
      <View style={styles.problems} testID="onboarding-problems">
        {problems.map((p) => {
          const target = fixTarget(p, setup);
          const remove = removalFor(p, setup);
          return (
            <View key={p.path} style={styles.problem}>
              <Text variant="callout" style={[styles.problemText, { color: colors.dangerSoftForeground }]}>
                {p.label}: {p.message}
              </Text>
              {target.sheet ? (
                <Button
                  label="Fix"
                  size="sm"
                  variant="secondary"
                  accessibilityLabel={`Fix ${p.label}`}
                  testID={`onboarding-fix-${p.path}`}
                  onPress={() => onFix(p)}
                />
              ) : remove ? (
                <Button
                  label="Remove"
                  size="sm"
                  variant="secondary"
                  accessibilityLabel={`Remove ${p.label}`}
                  testID={`onboarding-remove-${p.path}`}
                  onPress={() => dispatch(remove)}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Questions and customer groups aren't edited in the app: a broken one can be dropped (and added back later). */
function removalFor(problem: SetupProblem, setup: BusinessSetup): SetupAction | null {
  if (problem.index === null) return null;
  if (problem.section === "questions") return { type: "removeQuestion", index: problem.index };
  const group = problem.section === "groups" ? setup.customerGroups[problem.index] : undefined;
  return group ? { type: "removeGroup", key: group.key } : null;
}

/** Where the draft came from: an AI draft, or a template (picked, or matched when AI isn't configured). */
function SourceNote({ setup, origin }: { setup: BusinessSetup; origin: DraftOrigin }) {
  const templates = useTemplates();
  const key = origin.kind === "template" ? origin.key : setup.industry;
  const name = templates.data?.find((t) => t.key === key)?.name ?? key.replace(/_/g, " ");
  if (origin.kind === "ai" && setup.source === "ai") {
    return (
      <View style={styles.source} testID="onboarding-source-ai">
        <Badge tone="brand" label="Drafted by AI" />
        <Text variant="callout" tone="muted">
          Double-check prices and hours.
        </Text>
        <Icon icon={Sparkles} size={16} color="brand" />
      </View>
    );
  }
  return (
    <View style={styles.source} testID="onboarding-source-template">
      <Badge label="Template" />
      <Text variant="callout" tone="muted" style={styles.sourceText}>
        {origin.kind === "ai"
          ? `Started from the ${name} template. AI isn't available right now, so we matched your description.`
          : `Started from the ${name} template.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: space[2], paddingTop: space[2] },
  rows: { marginHorizontal: -space[4] },
  dot: { width: space[2.5], height: space[2.5], borderRadius: radius.full },
  source: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  sourceText: { flex: 1, minWidth: space[16] * 3 },
  problemBox: {
    gap: space[2],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
  },
  problemTitle: { flexDirection: "row", alignItems: "center", gap: space[2] },
  problems: { gap: space[2] },
  problem: { flexDirection: "row", alignItems: "center", gap: space[2] },
  problemText: { flex: 1 },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    gap: space[2],
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  status: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], minHeight: MIN_TOUCH },
  statusText: { flexShrink: 1 },
});
