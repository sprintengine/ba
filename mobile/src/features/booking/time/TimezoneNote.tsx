import { StyleSheet, View } from "react-native";
import { Globe } from "lucide-react-native";
import { timeZoneLabel } from "@shared/format";
import { Icon, Text } from "~/ui";
import { space } from "~/ui/tokens";

/** The phone's own zone (Hermes has Intl). */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** "Times in Dublin time (IST)", noting when that differs from the phone's zone. */
export function TimezoneNote({ timeZone }: { timeZone: string }) {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  const differs = deviceTimeZone() !== timeZone;
  return (
    <View style={styles.row}>
      <Icon icon={Globe} size={14} color="subtleForeground" />
      <Text variant="footnote" tone="muted" style={styles.text}>
        Times in {city} time ({timeZoneLabel(timeZone)})
        {differs ? (
          <Text variant="footnote" tone="subtle">
            {" "}
            · different from your phone
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[1.5] },
  text: { flex: 1 },
});
