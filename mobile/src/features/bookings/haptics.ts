/**
 * Haptic feedback for the business day's key actions (approve, create, cancel, mark…): a success tick when something
 * went through, a warning buzz for a destructive one, a light tap for a selection. Never blocks or throws.
 */
import * as Haptics from "expo-haptics";
import { logError } from "~/lib/logger";

const quietly = (p: Promise<unknown>) => void p.catch((e: unknown) => logError(e, { feature: "haptics" }));

export const haptics = {
  success: () => quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  select: () => quietly(Haptics.selectionAsync()),
};
