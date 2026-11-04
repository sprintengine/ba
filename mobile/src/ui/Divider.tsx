import { StyleSheet, View } from "react-native";
import { useTheme } from "./theme";

/** A hairline between rows or sections. `inset` lines it up with row text (after a leading icon). */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />
  );
}
