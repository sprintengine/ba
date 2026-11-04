import { forwardRef, useId, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { centsToInput, currencySymbol, parseMoney } from "@shared/format";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { borderWidth, fontFamily, MIN_TOUCH, radius, space, typeScale } from "./tokens";

/** Larger values are cut to this while typing, so a held key can't produce an unsafe integer. */
const MAX_TYPED = 1_000_000_000;

type Shared = Omit<
  TextInputProps,
  "style" | "value" | "onChangeText" | "keyboardType" | "inputMode" | "placeholderTextColor"
> & {
  label: string;
  hint?: string;
  error?: string | null;
};

export type NumberFieldProps = Shared & {
  /** Whole, non-negative numbers; null while the field is empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** A suffix inside the field ("min", "days"); read after the label by screen readers. */
  unit?: string;
  /** The unit spelled out for screen readers ("minutes"). */
  unitLabel?: string;
};

export type MoneyFieldProps = Shared & {
  /** Minor units (cents), null while empty: exactly what the API takes. */
  value: number | null;
  onChange: (cents: number | null) => void;
  currency: string;
  locale?: string;
};

/** A whole-number field (minutes, days, seats). The website's NumberInput: only digits can be typed. */
export const NumberField = forwardRef<TextInput, NumberFieldProps>(function NumberField(
  { value, onChange, unit, unitLabel, onBlur, ...rest },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || Number.isNaN(value) ? "" : String(value));
  return (
    <AffixInput
      ref={ref}
      {...rest}
      suffix={unit}
      a11ySuffix={unitLabel ?? unit}
      keyboardType="number-pad"
      value={shown}
      onChangeText={(text) => {
        const digits = text.replace(/[^\d]/g, "");
        setDraft(digits);
        onChange(digits === "" ? null : Math.min(Number(digits), MAX_TYPED));
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
});

/** A price in the business's currency, typed as "45" or "45.50" (or "45,50"); held as cents. */
export const MoneyField = forwardRef<TextInput, MoneyFieldProps>(function MoneyField(
  { value, onChange, currency, locale = "en-IE", onBlur, error, ...rest },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? centsToInput(value, currency, locale);
  const parsed = draft === null ? null : parseMoney(draft, currency, locale);
  const invalid = draft !== null && draft.trim() !== "" && (parsed === null || parsed < 0);
  return (
    <AffixInput
      ref={ref}
      {...rest}
      error={error ?? (invalid ? "Enter an amount like 45 or 45.50" : null)}
      prefix={currencySymbol(currency, locale)}
      a11ySuffix={currency}
      keyboardType="decimal-pad"
      placeholder="0.00"
      value={shown}
      onChangeText={(text) => {
        setDraft(text);
        const cents = parseMoney(text, currency, locale);
        if (cents !== null && cents >= 0) onChange(cents);
        else if (text.trim() === "") onChange(null);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
});

type AffixInputProps = Shared & {
  value: string;
  onChangeText: (text: string) => void;
  keyboardType: TextInputProps["keyboardType"];
  prefix?: string;
  suffix?: string;
  a11ySuffix?: string;
};

/** TextField's look with a prefix or suffix inside the box. */
const AffixInput = forwardRef<TextInput, AffixInputProps>(function AffixInput(
  { label, hint, error, prefix, suffix, a11ySuffix, onFocus, onBlur, ...rest },
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
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.ring : colors.input,
            borderWidth: focused || error ? borderWidth.focus : borderWidth.hairline,
          },
        ]}
      >
        {prefix ? (
          <Text tone="muted" weight="medium" accessibilityElementsHidden importantForAccessibility="no">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={a11ySuffix ? `${label}, ${a11ySuffix}` : label}
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
          style={[styles.input, { color: colors.foreground }]}
          {...rest}
        />
        {suffix ? (
          <Text variant="callout" tone="subtle" accessibilityElementsHidden importantForAccessibility="no">
            {suffix}
          </Text>
        ) : null}
      </View>
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
  box: {
    minHeight: MIN_TOUCH + space[1],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  input: {
    flex: 1,
    paddingVertical: space[2],
    fontFamily: fontFamily.regular,
    fontSize: typeScale.body.fontSize,
    fontVariant: ["tabular-nums"],
  },
});
