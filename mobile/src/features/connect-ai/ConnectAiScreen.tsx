/**
 * `/connect-ai?server=customer|business`: add bookanything to Claude or ChatGPT (the website's help pages
 * `/help/ai-assistant` and `/help/ai-agents-for-business`, condensed). The server URL with Copy; Claude opens its
 * "Add custom connector" dialog filled in (its documented install link); ChatGPT has no such link, so the URL is copied
 * and its Plugins page opened, with the steps to follow there.
 */
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { AccessibilityInfo, Linking, StyleSheet, View } from "react-native";
import { Copy, ExternalLink, TriangleAlert } from "lucide-react-native";
import { env } from "~/config/env";
import { logError } from "~/lib/logger";
import { openWebsite } from "~/lib/links";
import { Button, Card, Icon, ScreenScroll, Text, useTheme, useToast } from "~/ui";
import { radius, space } from "~/ui/tokens";
import {
  CHATGPT_PLUGINS_URL,
  HELP_PATHS,
  claudeConnectorLink,
  connectorName,
  mcpServerUrl,
  parseServer,
  reachableByAiApps,
  type McpServer,
} from "./connect-ai";

const INTRO: Record<McpServer, { lead: string; points: string[] }> = {
  customer: {
    lead: "Connect bookanything to Claude, ChatGPT or another AI assistant, then find, book and manage appointments just by asking.",
    points: [
      "Finds businesses and free times, and books, moves or cancels for you, as you.",
      "Nothing is booked, moved or cancelled until you approve it here: you get a notification with the change.",
      "Disconnect it any time in Connected apps.",
    ],
  },
  business: {
    lead: "Run your business from your own AI agent: ask about your day, handle bookings, keep the diary and your clients' details right.",
    points: [
      "It works as you, with your role at each business; staff see and change only their own calendar.",
      "Looking things up is instant. Every change waits for you to approve it here, from a notification.",
      "One connection covers every business you belong to. Disconnect it any time in Connected apps.",
    ],
  },
};

function Steps({ steps }: { steps: string[] }) {
  return (
    <View style={styles.steps} accessibilityRole="list">
      {steps.map((step, i) => (
        <View key={step} style={styles.step}>
          <Text variant="callout" tone="muted" numeric>
            {i + 1}.
          </Text>
          <Text variant="callout" style={styles.flex}>
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ConnectAiScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const server = parseServer(useLocalSearchParams<{ server?: string }>().server);
  const url = mcpServerUrl(env.webUrl, server);
  const intro = INTRO[server];
  const reachable = reachableByAiApps(url);

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    toast.show("Server URL copied");
    AccessibilityInfo.announceForAccessibility("Server URL copied");
  };

  const open = (link: string) =>
    Linking.openURL(link).catch((e: unknown) => {
      logError(e, { link: "ai-app" });
      toast.show("Couldn't open it. Copy the server URL and add it in the app.", "danger");
    });

  return (
    <ScreenScroll testID="connect-ai">
      <Stack.Screen
        options={{ title: server === "business" ? "Connect your AI agent" : "Connect an AI app" }}
      />
      <Text variant="body">{intro.lead}</Text>
      <View style={styles.points}>
        {intro.points.map((p) => (
          <Text key={p} variant="callout" tone="muted">
            • {p}
          </Text>
        ))}
      </View>

      <Card>
        <View style={styles.section}>
          <Text variant="title3">{server === "business" ? "Business server URL" : "Your server URL"}</Text>
          <View
            style={[styles.url, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
            accessible
            accessibilityLabel={`Server URL: ${url}`}
          >
            <Text variant="callout" selectable testID="mcp-server-url">
              {url}
            </Text>
          </View>
          <Button
            icon={Copy}
            label="Copy server URL"
            variant="secondary"
            onPress={() => void copy()}
            testID="copy-url"
          />
          {reachable ? null : (
            <View style={styles.warning} testID="unreachable-warning">
              <Icon icon={TriangleAlert} size={16} color="warningSoftForeground" />
              <Text variant="footnote" tone="warning" style={styles.flex}>
                This is a development address: AI apps reach bookanything from the internet, so connect them
                to the live site&apos;s server instead.
              </Text>
            </View>
          )}
          <Text variant="footnote" tone="muted">
            The first time you use it, the app opens bookanything so you can sign in and approve what it may
            do.
          </Text>
        </View>
      </Card>

      <Card>
        <View style={styles.section}>
          <Text variant="title3">Claude</Text>
          <Text variant="callout" tone="muted">
            Opens Claude&apos;s &quot;Add custom connector&quot; with bookanything filled in. Connectors work
            in claude.ai, Claude Desktop and the Claude apps.
          </Text>
          <Button
            icon={ExternalLink}
            label="Add to Claude"
            onPress={() => void open(claudeConnectorLink(connectorName(server), url))}
            testID="add-to-claude"
          />
          <Steps
            steps={[
              "Check the name and URL, leave the OAuth client fields empty, and tap Add.",
              "Tap Connect, then sign in and approve on the bookanything page.",
              "In a chat, turn bookanything on from + › Connectors.",
            ]}
          />
        </View>
      </Card>

      <Card>
        <View style={styles.section}>
          <Text variant="title3">ChatGPT</Text>
          <Text variant="callout" tone="muted">
            ChatGPT has no link that fills this in, so this copies the server URL and opens ChatGPT&apos;s
            plugins.
          </Text>
          <Button
            icon={ExternalLink}
            label="Copy URL and open ChatGPT"
            variant="secondary"
            onPress={() => void copy().then(() => open(CHATGPT_PLUGINS_URL))}
            testID="open-chatgpt"
          />
          <Steps
            steps={[
              "If you don't see the + button, turn on Developer mode in Settings › Security and login (it depends on your plan).",
              "Tap +, choose Add custom MCP server, and name it bookanything.",
              "Under Connection, choose a public endpoint and paste the server URL.",
              "Create it, then sign in and approve on the bookanything page.",
              "In a new chat, add bookanything from the tools menu.",
            ]}
          />
        </View>
      </Card>

      <Text variant="callout" tone="muted">
        Other assistants that support remote MCP servers with OAuth sign-in work too: add the server URL where
        they ask for one. The apps change their menus often; the full guide has more detail.
      </Text>
      <View style={styles.links}>
        <Button variant="ghost" label="Full guide" onPress={() => void openWebsite(HELP_PATHS[server])} />
        <Button
          variant="ghost"
          label="Connected apps"
          onPress={() => {
            if (router.canGoBack()) router.back();
            router.navigate("/my/connected-apps");
          }}
        />
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  points: { gap: space[1] },
  section: { gap: space[3] },
  url: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space[3], paddingVertical: space[2.5] },
  warning: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  steps: { gap: space[1.5] },
  step: { flexDirection: "row", gap: space[2] },
  flex: { flex: 1 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
