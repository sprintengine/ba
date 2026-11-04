/**
 * Bo beside the content on large screens (iPad, a wide window): a side panel at the trailing edge of the business
 * shell, opened by the header's Bo button, like the website's side sheet. The conversation survives closing and
 * reopening it; on phones (or a narrow Split View) the button opens the `/assistant` modal instead.
 */
import { router } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentBusiness } from "@shared/business/business-context";
import { useLayout, useTheme } from "~/ui";
import { layout } from "~/ui/tokens";
import { AssistantProvider } from "./assistant-context";
import { AssistantPanel } from "./AssistantPanel";

let dockOpen = false;
const listeners = new Set<() => void>();

function setDock(open: boolean) {
  if (dockOpen === open) return;
  dockOpen = open;
  listeners.forEach((l) => l());
}

export const assistantDock = {
  open: () => setDock(true),
  close: () => setDock(false),
  toggle: () => setDock(!dockOpen),
  isOpen: () => dockOpen,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAssistantDockOpen(): boolean {
  return useSyncExternalStore(subscribe, () => dockOpen);
}

/**
 * Opens Bo for [business]: the side panel where the window is wide, the modal otherwise. The header's Bo button calls
 * this.
 */
export function openAssistant(business: string, isWide: boolean) {
  if (isWide) assistantDock.toggle();
  else router.push({ pathname: "/assistant", params: { business } });
}

/** The side panel; renders nothing on narrow windows or until first opened. Inside the business shell. */
export function AssistantDock() {
  const { isWide } = useLayout();
  const { colors } = useTheme();
  const business = useCurrentBusiness();
  const insets = useSafeAreaInsets();
  const open = useAssistantDockOpen();
  // Mounted from the first opening on, so the conversation is still there when it's opened again.
  const [used, setUsed] = useState(false);
  if (open && isWide && !used) setUsed(true);
  const close = useCallback(() => assistantDock.close(), []);
  const navigate = useCallback((href: string) => router.navigate(href as never), []);
  if (!used || !isWide) return null;
  return (
    <View
      style={[
        styles.dock,
        { borderLeftColor: colors.border, backgroundColor: colors.background, paddingTop: insets.top },
        open ? null : styles.hidden,
      ]}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      testID="assistant-dock"
    >
      <AssistantProvider key={business.id} onClose={close} onNavigate={navigate}>
        <AssistantPanel closable />
      </AssistantProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { width: layout.splitListWidth, borderLeftWidth: StyleSheet.hairlineWidth },
  hidden: { display: "none" },
});
