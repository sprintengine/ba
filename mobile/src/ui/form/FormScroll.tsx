import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "../Button";
import { Text } from "../Text";
import { useTheme } from "../theme";
import { layout, MIN_TOUCH, radius, space } from "../tokens";

export type FormScrollProps = {
  children: ReactNode;
  /** `form` (520pt, a single column of fields) or `content` (760pt, editors with side-by-side fields on iPad). */
  width?: "form" | "content";
  testID?: string;
};

/**
 * A form's scrolling body: centred at a comfortable width on iPad, the focused field kept above the keyboard
 * (`automaticallyAdjustKeyboardInsets` on iOS, `adjustResize` on Android), the keyboard dismissed by dragging, and
 * taps on buttons going through while it's up.
 */
export function FormScroll({ children, width = "form", testID }: FormScrollProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        testID={testID}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={[
          styles.content,
          { maxWidth: width === "form" ? layout.formWidth : layout.maxContentWidth },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export type HeaderButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** A save in flight: a spinner, presses ignored. */
  loading?: boolean;
  /** Bold, in the brand colour (the screen's main action: Save). */
  primary?: boolean;
  testID?: string;
};

/**
 * A text button for a native header (`headerRight: () => <HeaderButton label="Save" … />`): iOS's Save / Done in
 * the navigation bar, with a 44pt target and a spinner while saving.
 */
export function HeaderButton({ label, onPress, disabled, loading, primary, testID }: HeaderButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={space[2]}
      style={styles.headerButton}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Text
          weight={primary ? "semibold" : "medium"}
          style={{ color: inactive ? colors.subtleForeground : primary ? colors.brand : colors.foreground }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export type SaveBarProps = {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
};

/**
 * The end of a form with unsaved changes (the website's SaveBar): Discard and Save changes, for people who scroll to
 * the bottom rather than reach for the header's Save. Hidden while there is nothing to save.
 */
export function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel = "Save changes" }: SaveBarProps) {
  const { colors } = useTheme();
  if (!dirty) return null;
  return (
    <View
      style={[styles.saveBar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      testID="save-bar"
    >
      <Text variant="callout" tone="muted" style={styles.saveText}>
        You have unsaved changes
      </Text>
      <View style={styles.saveButtons}>
        <Button label="Discard" variant="ghost" onPress={onDiscard} disabled={saving} />
        <Button label={saveLabel} onPress={onSave} loading={saving} testID="save-bar-save" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  saveBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space[3],
  },
  saveText: { flexGrow: 1, flexShrink: 1, paddingLeft: space[1] },
  saveButtons: { flexDirection: "row", gap: space[2], marginLeft: "auto" },
  content: {
    padding: space[4],
    paddingBottom: space[12],
    gap: space[4],
    width: "100%",
    alignSelf: "center",
  },
  headerButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space[2],
    alignItems: "center",
    justifyContent: "center",
  },
});
