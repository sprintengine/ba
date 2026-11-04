import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowDown, ArrowUp, ChevronRight, Lock } from "lucide-react-native";
import type { FormQuestion } from "@shared/api/types";
import { Badge, Icon, IconButton, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";

/**
 * One booking question: its label with Required, Sensitive and Off marks, its answer type and service. Opens its
 * sheet; in the unfiltered list it also moves up and down (buttons, and VoiceOver's actions on the row).
 */
export const QuestionRow = memo(function QuestionRow({
  question: q,
  summary,
  movable,
  first,
  last,
  busy,
  onPress,
  onMove,
}: {
  question: FormQuestion;
  summary: string;
  /** Show the move buttons (only when every question is listed, as on the website). */
  movable: boolean;
  first: boolean;
  last: boolean;
  busy: boolean;
  onPress: (q: FormQuestion) => void;
  onMove: (q: FormQuestion, dir: -1 | 1) => void;
}) {
  const { colors } = useTheme();
  const label = [
    q.label,
    q.required ? "required" : null,
    q.sensitive ? "sensitive" : null,
    q.isActive ? null : "off",
  ]
    .filter(Boolean)
    .join(", ");
  const canUp = movable && !first && !busy;
  const canDown = movable && !last && !busy;
  const actions = [
    ...(canUp ? [{ name: "moveUp", label: "Move up" }] : []),
    ...(canDown ? [{ name: "moveDown", label: "Move down" }] : []),
  ];
  return (
    <View style={styles.row}>
      {movable ? (
        <View style={styles.move}>
          <IconButton
            icon={ArrowUp}
            size={18}
            accessibilityLabel={`Move “${q.label}” up`}
            disabled={!canUp}
            color={canUp ? "mutedForeground" : "border"}
            onPress={() => onMove(q, -1)}
            testID={`question-up-${q.id}`}
          />
          <IconButton
            icon={ArrowDown}
            size={18}
            accessibilityLabel={`Move “${q.label}” down`}
            disabled={!canDown}
            color={canDown ? "mutedForeground" : "border"}
            onPress={() => onMove(q, 1)}
            testID={`question-down-${q.id}`}
          />
        </View>
      ) : null}
      <Pressable
        testID={`question-${q.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${summary}`}
        accessibilityHint="Edit or delete the question"
        accessibilityActions={actions}
        onAccessibilityAction={(e) => onMove(q, e.nativeEvent.actionName === "moveUp" ? -1 : 1)}
        onPress={() => onPress(q)}
        style={({ pressed }) => [
          styles.main,
          movable ? null : styles.inset,
          pressed ? { backgroundColor: colors.muted } : null,
        ]}
      >
        <View style={styles.text}>
          <View style={styles.title}>
            <Text weight="medium" style={styles.name}>
              {q.label}
            </Text>
            {q.required ? <Badge label="Required" /> : null}
            {q.sensitive ? <SensitiveMark /> : null}
            {q.isActive ? null : <Badge label="Off" />}
          </View>
          <Text variant="footnote" tone="muted" numberOfLines={2}>
            {summary}
          </Text>
        </View>
        <Icon icon={ChevronRight} size={18} color="subtleForeground" />
      </Pressable>
    </View>
  );
});

/** The website's SensitiveMark: never emailed or shared with AI. */
function SensitiveMark() {
  const { colors } = useTheme();
  return (
    <View style={[styles.sensitive, { backgroundColor: colors.warningSoft }]}>
      <Icon icon={Lock} size={12} color="warningSoftForeground" />
      <Text variant="footnote" weight="semibold" style={{ color: colors.warningSoftForeground }}>
        Sensitive
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  move: { paddingLeft: space[1] },
  main: {
    flex: 1,
    minHeight: MIN_TOUCH + space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingRight: space[4],
    paddingVertical: space[3],
  },
  inset: { paddingLeft: space[4] },
  text: { flex: 1, gap: space[1] },
  title: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  name: { flexShrink: 1 },
  sensitive: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
});
