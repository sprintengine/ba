import { useCurrentBusiness } from "@shared/business/business-context";
import { StyleSheet, View } from "react-native";
import { Plus } from "lucide-react-native";
import { HeaderActions } from "~/shell/HeaderActions";
import { IconButton } from "~/ui";

/**
 * The header's right side on a screen that creates things: "+" (New booking, Add customer…) before the section's
 * usual Bo and notifications. Pass as `headerRight: () => <HeaderNew … />`.
 */
export function HeaderNew({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { slug } = useCurrentBusiness();
  return (
    <View style={styles.row}>
      <IconButton icon={Plus} accessibilityLabel={label} color="brand" onPress={onPress} testID={testID} />
      <HeaderActions business={slug} />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center" } });
