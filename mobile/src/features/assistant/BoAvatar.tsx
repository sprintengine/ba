import { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { CircleAlert, Ear, PartyPopper, Sparkles } from "lucide-react-native";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { MOOD_LABEL, type BoMood } from "@shared/assistant/mood";
import { Icon, useReducedMotion, useTheme, type IconComponent } from "~/ui";
import { radius, type ThemeColors } from "~/ui/tokens";

const LOOK: Record<BoMood, { icon: IconComponent; bg: keyof ThemeColors; fg: keyof ThemeColors }> = {
  idle: { icon: Sparkles, bg: "brandSoft", fg: "brandSoftForeground" },
  attention: { icon: Sparkles, bg: "brandSoft", fg: "brandSoftForeground" },
  listening: { icon: Ear, bg: "brandSoft", fg: "brandSoftForeground" },
  thinking: { icon: Sparkles, bg: "brand", fg: "brandForeground" },
  success: { icon: PartyPopper, bg: "successSoft", fg: "successSoftForeground" },
  error: { icon: CircleAlert, bg: "warningSoft", fg: "warningSoftForeground" },
};

/**
 * Bo's face: a badge whose look follows the mood (the website draws a character; the app keeps to its icon set). It
 * breathes while Bo thinks, unless Reduce Motion is on. `labelled` makes it say "Bo, thinking" to screen readers.
 */
export function BoAvatar({
  mood,
  size = 36,
  labelled = false,
}: {
  mood: BoMood;
  size?: number;
  labelled?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  const thinking = mood === "thinking" && !reduced;

  useEffect(() => {
    if (!thinking) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [thinking, pulse]);

  const look = LOOK[mood];
  return (
    <View
      accessible={labelled}
      accessibilityLabel={labelled ? `${ASSISTANT_NAME}, ${MOOD_LABEL[mood]}` : undefined}
      importantForAccessibility={labelled ? "yes" : "no-hide-descendants"}
      accessibilityElementsHidden={!labelled}
    >
      <Animated.View
        style={[
          styles.badge,
          { width: size, height: size, backgroundColor: colors[look.bg], opacity: pulse },
        ]}
      >
        <Icon icon={look.icon} size={Math.round(size * 0.5)} color={look.fg} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
});
