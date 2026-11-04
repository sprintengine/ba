import { router } from "expo-router";
import { openWebsite } from "~/lib/links";
import { notificationTarget } from "./links";

/**
 * Opens what a notification is about: the app's screen, or the website for the rest. From a modal (the inbox), the
 * modal closes first so the screen opens in its own section.
 */
export function openNotificationLink(link: string, { fromModal = false }: { fromModal?: boolean } = {}) {
  const target = notificationTarget(link);
  if (!target) return false;
  if (target.kind === "web") {
    void openWebsite(target.path);
    return true;
  }
  if (fromModal && router.canGoBack()) router.back();
  router.navigate(target.href as never);
  return true;
}
