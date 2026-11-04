import { Stack, useLocalSearchParams } from "expo-router";
import { PanelsTopLeft } from "lucide-react-native";
import { openWebsiteInBrowser } from "~/lib/links";
import { RequireRole } from "~/shell/RequireRole";
import { EmptyState, ScreenScroll } from "~/ui";

/**
 * The site builder stays on the website on purpose (docs/mobile.md "What stays on the website"): it edits a
 * desktop-sized page with live previews. The app opens it in the system browser, not inside the app: the website's
 * dashboard around it links to Billing, where a plan is bought (App Store 3.1.1).
 */
export function SiteScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <RequireRole min="admin">
      <Stack.Screen options={{ title: "Site" }} />
      <ScreenScroll testID="site">
        <EmptyState
          icon={PanelsTopLeft}
          title="Edit your site on the web"
          description="Themes, sections, images and AI changes need a bigger screen. The site editor opens in your browser (sign in there if it asks); your changes publish from there."
          action={{
            label: "Open in your browser",
            onPress: () => void openWebsiteInBrowser(`/dashboard/${slug}/site`),
          }}
        />
      </ScreenScroll>
    </RequireRole>
  );
}
