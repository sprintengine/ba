/**
 * `/assistant?business=<slug>` (optionally `&ask=<prompt>`): Bo as a modal over any screen, for the business named.
 * On iPad the header's Bo button opens the side panel instead (`AssistantDock`); this route still works there (a deep
 * link, a notification).
 */
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { AssistantBusinessScope } from "./AssistantBusinessScope";
import { AssistantProvider } from "./assistant-context";
import { AssistantPanel } from "./AssistantPanel";

export function AssistantScreen() {
  const { business, ask } = useLocalSearchParams<{ business?: string; ask?: string }>();
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(business ? `/dashboard/${business}` : "/");
  }, [business]);
  // A link out of Bo (a result, a nudge) closes the modal and opens the page underneath.
  const navigate = useCallback((href: string) => {
    if (router.canGoBack()) router.back();
    router.navigate(href as never);
  }, []);
  return (
    <>
      <Stack.Screen
        // The panel has its own header (Bo, the credits, close), as on iPad.
        options={{ title: ASSISTANT_NAME, headerShown: false }}
      />
      <AssistantBusinessScope slug={business}>
        <AssistantProvider onClose={close} onNavigate={navigate} initialPrompt={ask}>
          <AssistantPanel closable />
        </AssistantProvider>
      </AssistantBusinessScope>
    </>
  );
}
