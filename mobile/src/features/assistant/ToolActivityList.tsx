import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Check, CircleAlert } from "lucide-react-native";
import type { ToolActivity } from "@shared/api/types";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";

/** What a tool step is called for people: its summary once done, else its label ("Checking the calendar…"). */
export function toolText(tool: ToolActivity): string {
  if (tool.status === "done" && tool.summary) return tool.summary;
  return tool.status === "running" ? `${tool.label}…` : tool.label;
}

const STATUS_WORD = { running: "in progress", done: "done", error: "didn't work" } as const;

/** What Bo looked up or prepared for this answer: small chips (running, done or failed). */
export function ToolActivityList({ tools }: { tools: ToolActivity[] }) {
  const { colors } = useTheme();
  if (tools.length === 0) return null;
  return (
    <View style={styles.list} accessibilityLabel={`What ${ASSISTANT_NAME} did`} accessibilityRole="list">
      {tools.map((t) => {
        const failed = t.status === "error";
        return (
          <View
            key={t.id}
            accessible
            accessibilityLabel={`${toolText(t)} (${STATUS_WORD[t.status]})`}
            style={[
              styles.chip,
              {
                backgroundColor: failed ? colors.warningSoft : colors.surfaceSunken,
                borderColor: failed ? colors.warning : colors.borderSubtle,
              },
            ]}
          >
            {t.status === "running" ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : t.status === "done" ? (
              <Icon icon={Check} size={14} color="success" />
            ) : (
              <Icon icon={CircleAlert} size={14} color="warningSoftForeground" />
            )}
            <Text
              variant="footnote"
              tone={failed ? "warning" : "muted"}
              numberOfLines={1}
              style={styles.text}
            >
              {toolText(t)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1.5],
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space[2.5],
    paddingVertical: space[1],
  },
  text: { flexShrink: 1 },
});
