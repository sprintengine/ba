import { router, type Href } from "expo-router";
import { Share, StyleSheet, View } from "react-native";
import { Bot, ExternalLink, Share2 } from "lucide-react-native";
import type { AgentChangeKind, AiAgentsAccess, UpdateBusiness } from "@shared/api/types";
import { useUpdateBusiness } from "@shared/api/hooks/use-business";
import { useBusinessContext } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { websiteUrl } from "~/lib/links";
import { Button, Card, Checkbox, EmptyState, RadioGroup, Section, Text, useTheme } from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { borderWidth, radius, space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { accessOptions, BUSINESS_MCP_PATH, CONNECTED_APPS_PATH, KINDS } from "./options";

/**
 * Settings › AI agents (the website's AiAgentsSettings, §20.7–20.8): who may run this business from their own AI
 * apps, which of their changes go ahead without approval here, and how to connect. Only an owner changes the rules;
 * admins see them. Only offered where the deployment serves the business MCP (`aiAgentsAvailable`).
 */
export function AiAgentsSettings() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const update = useUpdateBusiness(business.id);
  const feedback = useSaveFeedback();
  const isOwner = business.myRole === "owner";
  const access = business.aiAgentsAccess ?? "admins";
  const auto = new Set(business.aiAgentsAutoApprove ?? []);

  if (!business.aiAgentsAvailable) {
    return (
      <SettingsPage segment="ai-agents">
        <Card>
          <EmptyState
            testID="ai-agents-unavailable"
            icon={Bot}
            title="Not available yet"
            description={
              business.assistantAvailable
                ? "Connecting your own AI agents isn't switched on for bookanything yet. The assistant in the dashboard works as usual."
                : "Connecting your own AI agents isn't switched on for bookanything yet."
            }
          />
        </Card>
      </SettingsPage>
    );
  }

  const save = (patch: UpdateBusiness, message: string) =>
    void feedback.run(() => update.mutateAsync(patch), message);

  const setKind = (kind: AgentChangeKind, on: boolean) => {
    const next = KINDS.map((k) => k.value).filter((k) => (k === kind ? on : auto.has(k)));
    save(
      { aiAgentsAutoApprove: next },
      on ? "Agents can make these without approval" : "These need approval again",
    );
  };

  const locked = !isOwner || update.isPending;
  const ownerOnly = isOwner ? null : (
    <Text variant="callout" tone="muted">
      Only an owner can change this.
    </Text>
  );

  return (
    <SettingsPage segment="ai-agents">
      <Section
        title="Who can use AI agents"
        description={`Your team can manage ${business.name} from Claude, ChatGPT and other AI agents, with the same role they have here.`}
      >
        <RadioGroup<AiAgentsAccess>
          label="Who can use AI agents"
          hideLabel
          testID="ai-access"
          value={access}
          options={accessOptions(!!business.assistantAvailable)}
          disabled={locked}
          onChange={(value) => save({ aiAgentsAccess: value }, "Saved who can use AI agents")}
        />
        {ownerOnly}
      </Section>

      <Section
        title="Approving changes"
        description="An agent can only prepare a change. It goes ahead once the person using the agent approves it here on bookanything: the agent gives them a link. Tick the kinds of change an agent can make once the person says yes in their AI app instead."
      >
        <View
          accessibilityRole="list"
          accessibilityLabel="Changes that don't need approval here"
          style={styles.kinds}
        >
          {KINDS.map((k) => (
            <Checkbox
              key={k.value}
              testID={`ai-auto-${k.value}`}
              label={k.label}
              description={k.description(v)}
              checked={auto.has(k.value)}
              disabled={locked}
              onChange={(on) => setKind(k.value, on)}
            />
          ))}
        </View>
        <Text variant="callout" tone="muted">
          A change to several {v("bookings")} at once always needs approval here. Everything an agent changes
          is in the activity log, marked as done by AI with the app&apos;s name.
        </Text>
        {ownerOnly}
      </Section>

      <Section
        title="Connect your agent"
        description="Add this address to your AI app as a custom connector, then sign in and approve it. One connection covers every business you belong to."
      >
        <ServerUrl url={websiteUrl(BUSINESS_MCP_PATH)} />
        <View style={styles.links}>
          <Button
            testID="ai-help"
            variant="ghost"
            size="sm"
            icon={ExternalLink}
            label="Step-by-step for Claude and ChatGPT"
            onPress={() => router.push({ pathname: "/connect-ai", params: { server: "business" } })}
          />
          <Button
            testID="ai-requests"
            variant="ghost"
            size="sm"
            label="Your agents’ requests"
            onPress={() => router.push(`/dashboard/${business.slug}/approvals` as Href)}
          />
          <Button
            testID="ai-connected-apps"
            variant="ghost"
            size="sm"
            label="Your connected apps"
            onPress={() => router.push(CONNECTED_APPS_PATH as Href)}
          />
        </View>
      </Section>
    </SettingsPage>
  );
}

/** The business MCP server's address: selectable, and shared (Copy is in the share sheet) since the app has no clipboard. */
function ServerUrl({ url }: { url: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.url}>
      <View
        style={[styles.urlBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
        accessible
        accessibilityLabel={`Business server URL, ${url}`}
      >
        <Text selectable numberOfLines={2} testID="ai-server-url">
          {url}
        </Text>
      </View>
      <Button
        testID="ai-share-url"
        variant="secondary"
        size="sm"
        icon={Share2}
        label="Share or copy the address"
        onPress={() => void Share.share({ message: url }).catch(() => undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kinds: { gap: space[2] },
  links: { gap: space[1] },
  url: { gap: space[2] },
  urlBox: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
