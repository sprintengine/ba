/** The booking flow's choice steps and their chrome (the website's components/booking/steps.tsx). */
import { StyleSheet, View } from "react-native";
import { ChevronLeft, Sparkles, Users } from "lucide-react-native";
import type { PublicBusiness, PublicService } from "@shared/api/types";
import { ANY_RESOURCE } from "@shared/booking/selection";
import { groupByCategory } from "@shared/booking/services";
import { formatDuration, formatMoney, formatPrice } from "@shared/format";
import { Button, EmptyState, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { ChoiceCard } from "./ChoiceCard";
import { ServiceCard } from "./ServiceCard";

/** "Step 2 of 5" with Back, the step's title (a header, announced on change) and its description. */
export function StepHeader({
  index,
  total,
  title,
  description,
  onBack,
}: {
  index: number;
  /** Null while not known (before a service is chosen): "Step 1" alone. */
  total: number | null;
  title: string;
  description?: string | null;
  onBack?: (() => void) | null;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {onBack ? (
          <Button
            testID="step-back"
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            label="Back"
            onPress={onBack}
          />
        ) : null}
        <Text variant="footnote" tone="subtle" numeric accessibilityLiveRegion="polite">
          Step {index + 1}
          {total !== null ? ` of ${total}` : ""}
        </Text>
      </View>
      <Text variant="title2" testID="step-title">
        {title}
      </Text>
      {description ? (
        <Text variant="callout" tone="muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

/** A thin segmented progress bar. */
export function StepProgress({ index, total }: { index: number; total: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityLabel="Booking progress"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.segment, { backgroundColor: i <= index ? colors.primary : colors.border }]}
        />
      ))}
    </View>
  );
}

export function GroupStep({
  groups,
  value,
  onSelect,
}: {
  groups: PublicBusiness["customerGroups"];
  value: string | null;
  onSelect: (groupId: string) => void;
}) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Who is booking">
      {groups.map((g) => (
        <ChoiceCard
          key={g.id}
          testID={`group-${g.id}`}
          icon={Users}
          title={g.name}
          description={g.description}
          selected={value === g.id}
          onPress={() => onSelect(g.id)}
        />
      ))}
    </View>
  );
}

export function ServiceStep({
  services,
  currency,
  locale,
  value,
  onSelect,
}: {
  services: PublicService[];
  currency: string;
  locale: string;
  value: string | null;
  onSelect: (service: PublicService) => void;
}) {
  if (services.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nothing to book online just yet"
        description="This business hasn't published any services for online booking. Please get in touch with them directly."
      />
    );
  }
  return (
    <View style={styles.sections}>
      {groupByCategory(services).map((g) => (
        <View key={g.category ?? "all"} style={styles.list}>
          {g.category ? (
            <Text variant="caption" tone="subtle" accessibilityRole="header">
              {g.category.toUpperCase()}
            </Text>
          ) : null}
          {g.services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              currency={currency}
              locale={locale}
              selected={value === s.id}
              onSelect={onSelect}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function ExtrasStep({
  service,
  currency,
  locale,
  optionId,
  addonIds,
  onOption,
  onToggleAddon,
}: {
  service: PublicService;
  currency: string;
  locale: string;
  optionId: string | null;
  addonIds: string[];
  onOption: (id: string) => void;
  onToggleAddon: (id: string) => void;
}) {
  const options = [...service.options].sort((a, b) => a.sortOrder - b.sortOrder);
  const addons = [...service.addons].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <View style={styles.sections}>
      {options.length > 0 ? (
        <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Option">
          <Text variant="headline" accessibilityRole="header">
            Choose an option
          </Text>
          {options.map((o) => (
            <ChoiceCard
              key={o.id}
              testID={`option-${o.id}`}
              title={o.name}
              aside={formatPrice(o.priceCents, currency, { locale })}
              description={[o.description, formatDuration(o.durationMinutes)].filter(Boolean).join(" · ")}
              selected={optionId === o.id}
              onPress={() => onOption(o.id)}
            />
          ))}
        </View>
      ) : null}
      {addons.length > 0 ? (
        <View style={styles.list} accessibilityLabel="Extras">
          <View>
            <Text variant="headline" accessibilityRole="header">
              Add extras
            </Text>
            <Text variant="callout" tone="muted">
              Optional. Pick as many as you like.
            </Text>
          </View>
          {addons.map((a) => (
            <ChoiceCard
              key={a.id}
              kind="checkbox"
              testID={`addon-${a.id}`}
              title={a.name}
              aside={
                a.priceCents > 0 ? formatMoney(a.priceCents, currency, { locale, signed: true }) : "Free"
              }
              description={[a.description, a.extraMinutes > 0 ? `+${formatDuration(a.extraMinutes)}` : null]
                .filter(Boolean)
                .join(" · ")}
              selected={addonIds.includes(a.id)}
              onPress={() => onToggleAddon(a.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ResourceStep({
  requirement,
  noun,
  value,
  onSelect,
}: {
  requirement: NonNullable<PublicService["selectableRequirement"]>;
  /** The requirement's label, else the business's word for a resource ("Therapist"). */
  noun: string;
  value: string | null;
  onSelect: (resource: string) => void;
}) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={noun}>
      <ChoiceCard
        testID="resource-any"
        icon={Sparkles}
        title={`Any ${noun.toLowerCase()}`}
        description="See the most times. We'll match you with whoever is free."
        selected={value === ANY_RESOURCE}
        onPress={() => onSelect(ANY_RESOURCE)}
      />
      {requirement.resources.map((r) => (
        <ChoiceCard
          key={r.id}
          testID={`resource-${r.id}`}
          leading={<Initials name={r.name} />}
          title={r.name}
          description={r.description}
          selected={value === r.id}
          onPress={() => onSelect(r.id)}
        />
      ))}
    </View>
  );
}

function Initials({ name }: { name: string }) {
  const { colors } = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <View style={[styles.initials, { backgroundColor: colors.brandSoft }]}>
      <Text variant="footnote" weight="semibold" tone="brand" maxFontSizeMultiplier={1.2}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[1] },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: space[8] },
  progress: { flexDirection: "row", gap: space[1] },
  segment: { flex: 1, height: space[1], borderRadius: radius.full },
  sections: { gap: space[6] },
  list: { gap: space[2.5] },
  initials: {
    width: space[10],
    height: space[10],
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
