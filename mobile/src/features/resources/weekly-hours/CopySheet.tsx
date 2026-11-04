import { View } from "react-native";
import type { DayOfWeek } from "@shared/api/types";
import { Card, Divider, ListRow, Sheet, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { COPY_TARGETS } from "../resources";

/** Copy one day's hours to other days (the website's Copy menu): all days, weekdays or the weekend. */
export function CopySheet({
  label,
  visible,
  onCopy,
  onClose,
}: {
  /** The day being copied ("Monday"). */
  label: string;
  visible: boolean;
  onCopy: (targets: readonly DayOfWeek[]) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`Copy ${label}`} testID="copy-sheet">
      <Text variant="callout" tone="muted">
        Replaces the hours on those days with {label}&apos;s.
      </Text>
      <Card padding={0}>
        {COPY_TARGETS.map((t, i) => (
          <View key={t.key}>
            {i > 0 ? <Divider inset={space[4]} /> : null}
            <ListRow
              testID={`copy-${t.key}`}
              title={t.label}
              chevron={false}
              onPress={() => {
                onCopy(t.days);
                onClose();
              }}
            />
          </View>
        ))}
      </Card>
    </Sheet>
  );
}
