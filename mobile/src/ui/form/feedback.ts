/**
 * What a save says: a toast (announced to screen readers) with a success or error haptic. The website's
 * `toast.success` / `withToast`.
 */
import * as Haptics from "expo-haptics";
import { Alert } from "react-native";
import { errorMessage } from "@shared/api/client";
import { useToast } from "../Toast";

export function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function hapticError() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}

/** A light tap for a toggle or a selection. */
export function hapticSelection() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function useSaveFeedback() {
  const toast = useToast();
  return {
    /** "Settings saved". */
    saved: (message: string) => {
      hapticSuccess();
      toast.show(message, "success");
    },
    /** A failed action that has no form to show it in (a toggle, a delete). */
    failed: (error: unknown, fallback?: string) => {
      hapticError();
      toast.show(errorMessage(error, fallback), "danger");
    },
    /**
     * Runs `action`; toasts `message` when it worked, the error when it didn't (the website's `withToast`).
     * Resolves whether it worked.
     */
    run: async (action: () => Promise<unknown>, message: string): Promise<boolean> => {
      try {
        await action();
        hapticSuccess();
        toast.show(message, "success");
        return true;
      } catch (error) {
        hapticError();
        toast.show(errorMessage(error), "danger");
        return false;
      }
    },
  };
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/** A native confirmation (the website's ConfirmDialog); resolves true when confirmed. */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
}: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
