import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleAlert, CircleCheck, Info } from "lucide-react-native";
import { Icon } from "./Icon";
import { useReducedMotion } from "./motion";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { duration, layout, radius, shadow, space } from "./tokens";

export type ToastTone = "success" | "danger" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastApi = { show: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastApi>({ show: () => undefined });

/** How long a toast stays (long enough to read twice). */
export const TOAST_MS = 4000;

/** `toast.show("Booking cancelled")`: brief confirmation after an action. Also announced to screen readers. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++next.current;
    setItems((current) => [...current.slice(-2), { id, message, tone }]);
    AccessibilityInfo.announceForAccessibility(message);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), TOAST_MS);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack items={items} />
    </ToastContext.Provider>
  );
}

function ToastStack({ items }: { items: ToastItem[] }) {
  const insets = useSafeAreaInsets();
  if (items.length === 0) return null;
  return (
    <View pointerEvents="none" style={[styles.stack, { bottom: insets.bottom + space[16] }]}>
      {items.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </View>
  );
}

const ICONS = { success: CircleCheck, danger: CircleAlert, info: Info } as const;

function ToastView({ item }: { item: ToastItem }) {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const [appear] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: duration.base, useNativeDriver: true }).start();
  }, [appear]);
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        shadow[scheme],
        {
          backgroundColor: colors.primary,
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [space[3], 0] }) }],
        },
      ]}
    >
      <Icon icon={ICONS[item.tone]} size={18} color="primaryForeground" />
      <Text variant="callout" weight="medium" tone="primaryForeground" style={styles.message}>
        {item.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { position: "absolute", left: space[4], right: space[4], alignItems: "center", gap: space[2] },
  toast: {
    maxWidth: layout.maxContentWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.xl,
  },
  message: { flexShrink: 1 },
});
