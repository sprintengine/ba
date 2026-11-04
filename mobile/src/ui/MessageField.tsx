import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { useTheme } from "./theme";
import { borderWidth, fontFamily, MIN_TOUCH, radius, space, typeScale } from "./tokens";

export type MessageFieldProps = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  /** Required: the field has no visible label ("Message Bo"). */
  accessibilityLabel: string;
  /** Room on the trailing side for buttons drawn over the field (send, microphone). */
  trailingInset?: number;
};

/**
 * A multiline message box without a visible label, for chat composers (`TextField` is for forms). Grows with its
 * text up to a few lines, then scrolls.
 */
export const MessageField = forwardRef<TextInput, MessageFieldProps>(function MessageField(
  { trailingInset = 0, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      multiline
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
          paddingRight: space[3] + trailingInset,
          color: colors.foreground,
          backgroundColor: colors.surface,
          borderColor: focused ? colors.ring : colors.input,
          borderWidth: focused ? borderWidth.focus : borderWidth.hairline,
        },
      ]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: MIN_TOUCH + space[1],
    maxHeight: 160,
    borderRadius: radius.xl,
    paddingLeft: space[3],
    paddingTop: space[2.5],
    paddingBottom: space[2.5],
    fontFamily: fontFamily.regular,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
  },
});
