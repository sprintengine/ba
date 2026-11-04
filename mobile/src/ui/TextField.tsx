import { forwardRef, useId, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, fontFamily, MIN_TOUCH, radius, space, typeScale } from "./tokens";

export type TextFieldProps = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  /** Help under the field (format, why we ask). */
  hint?: string;
  /** A validation error: replaces the hint, is announced, and marks the field invalid. */
  error?: string | null;
};

/** A labelled text input. The label is its accessible name; hint or error its description. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const id = useId();
  const help = error ?? hint;
  return (
    <View style={styles.root}>
      <Text variant="callout" weight="medium" nativeID={`${id}-label`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}-label`}
        accessibilityHint={help ?? undefined}
        aria-invalid={!!error}
        placeholderTextColor={colors.subtleForeground}
        maxFontSizeMultiplier={typeScale.body.maxScale}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.ring : colors.input,
            borderWidth: focused || error ? borderWidth.focus : borderWidth.hairline,
          },
        ]}
        {...rest}
      />
      {help ? (
        <Text
          variant="footnote"
          tone={error ? "danger" : "subtle"}
          accessibilityLiveRegion={error ? "polite" : "none"}
        >
          {help}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: space[1.5] },
  input: {
    minHeight: MIN_TOUCH + space[1],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: fontFamily.regular,
    fontSize: typeScale.body.fontSize,
  },
});
