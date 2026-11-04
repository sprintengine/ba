import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { radius, shadow, space } from "./tokens";

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the content (the sheet's main action). */
  footer?: ReactNode;
  testID?: string;
};

/**
 * A modal sheet for a short task (pick an option, confirm a cancellation). iOS: the native page sheet (swipe down
 * to dismiss; a centred form sheet on iPad). Android: a bottom sheet over a scrim. Focus stays inside while open.
 * For a full flow with its own URL, use a modal route instead (`presentation: "formSheet"` in a Stack).
 */
export function Sheet({ visible, onClose, title, children, footer, testID }: SheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === "ios";
  const body = (
    <View
      testID={testID}
      accessibilityViewIsModal
      style={[
        styles.panel,
        { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, space[4]) },
        ios ? styles.fill : [styles.bottom, shadow[scheme]],
      ]}
    >
      <View style={styles.header}>
        <Text variant="title3" style={styles.title}>
          {title}
        </Text>
        <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle={ios ? "pageSheet" : "overFullScreen"}
      transparent={!ios}
    >
      {ios ? (
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.fill, { backgroundColor: colors.overlay }]}>
          <Pressable
            style={styles.fill}
            onPress={onClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
          />
          {body}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: { paddingTop: space[2] },
  bottom: { maxHeight: "85%", borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"] },
  header: { flexDirection: "row", alignItems: "center", paddingLeft: space[4], paddingRight: space[2] },
  title: { flex: 1 },
  content: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[3] },
  footer: { paddingHorizontal: space[4], paddingTop: space[2] },
});
