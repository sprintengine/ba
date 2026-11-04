import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { normalizeHex, readableForeground } from "@shared/theme/color";
import { Text } from "./Text";
import { TextField } from "./TextField";
import { useTheme } from "./theme";
import { borderWidth, MIN_TOUCH, radius, space } from "./tokens";

export type ColorFieldProps = {
  label: string;
  /** A six-digit hex colour. */
  value: string;
  onChange: (hex: string) => void;
  /** Curated choices (the website's BRAND_SWATCHES or SERVICE_COLORS). */
  swatches: readonly string[];
  /** Also offer a hex field for any colour. */
  custom?: boolean;
  hint?: string;
  error?: string | null;
  testID?: string;
};

/**
 * A colour: curated swatches (radio buttons named by their hex) and, optionally, a hex field for any other colour.
 * The swatch for the current value carries a tick drawn in a readable colour on it.
 */
export function ColorField({
  label,
  value,
  onChange,
  swatches,
  custom,
  hint,
  error,
  testID,
}: ColorFieldProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const current = normalizeHex(value);
  return (
    <View style={styles.root} testID={testID}>
      <Text variant="callout" weight="medium">
        {label}
      </Text>
      <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {swatches.map((swatch) => {
          const hex = normalizeHex(swatch) ?? swatch;
          const selected = hex === current;
          return (
            <Pressable
              key={hex}
              testID={testID ? `${testID}-${hex}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={`Colour ${hex}`}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                setDraft(null);
                onChange(hex);
              }}
              style={[
                styles.swatch,
                {
                  backgroundColor: hex,
                  borderColor: selected ? colors.foreground : colors.border,
                  borderWidth: selected ? borderWidth.focus : borderWidth.hairline,
                },
              ]}
            >
              {selected ? <Check size={18} color={readableForeground(hex)} strokeWidth={3} /> : null}
            </Pressable>
          );
        })}
      </View>
      {custom ? (
        <TextField
          label="Custom colour"
          testID={testID ? `${testID}-hex` : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#RRGGBB"
          maxLength={7}
          value={draft ?? value}
          onChangeText={(text) => {
            const next = text.startsWith("#") ? text : `#${text}`;
            setDraft(next);
            const hex = normalizeHex(next);
            if (hex && next.length === 7) onChange(hex);
          }}
          onBlur={() => setDraft(null)}
          error={error}
          hint={hint}
        />
      ) : error || hint ? (
        <Text variant="footnote" tone={error ? "danger" : "subtle"}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const SWATCH = MIN_TOUCH;

const styles = StyleSheet.create({
  root: { gap: space[2] },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space[2.5] },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
