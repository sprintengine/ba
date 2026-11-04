import { StyleSheet, View } from "react-native";
import { richText, type Inline } from "@shared/assistant/rich-text";
import { Text } from "~/ui";
import { space } from "~/ui/tokens";

function Inlines({ inlines }: { inlines: Inline[] }) {
  return inlines.map((part, i) =>
    part.bold ? (
      <Text key={i} weight="semibold">
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  );
}

/** Bo's little formatting (paragraphs, lists, **bold**) as native text. Never markup: plain text otherwise. */
export function RichText({ text }: { text: string }) {
  return (
    <View style={styles.blocks}>
      {richText(text).map((block, i) =>
        block.kind === "paragraph" ? (
          <Text key={i} selectable>
            <Inlines inlines={block.inlines} />
          </Text>
        ) : (
          <View key={i} style={styles.list} accessibilityRole="list">
            {block.items.map((item, j) => (
              <View key={j} style={styles.item}>
                <Text tone="muted" accessibilityElementsHidden importantForAccessibility="no">
                  {block.ordered ? `${j + 1}.` : "•"}
                </Text>
                <Text style={styles.itemText} selectable>
                  <Inlines inlines={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: space[2] },
  list: { gap: space[1] },
  item: { flexDirection: "row", gap: space[2] },
  itemText: { flex: 1 },
});
