import { router, Stack } from "expo-router";
import { Alert, StyleSheet, View } from "react-native";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  CornerDownLeft,
  Globe,
  KeyRound,
  Plug,
  Search,
  Store,
  Unplug,
} from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useConnectedApps, useRevokeConnectedApp } from "@shared/api/hooks/use-oauth";
import type { ConnectedApp } from "@shared/api/types";
import { formatConnectedAt, formatLastUsed, viewerTimeZone } from "@shared/oauth/format";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import {
  Badge,
  BusinessAvatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  type IconComponent,
  ScreenScroll,
  Skeleton,
  Text,
  useToast,
} from "~/ui";
import { space } from "~/ui/tokens";
import { AgentSettings } from "./AgentSettings";

const SCOPE_ICONS: Record<string, IconComponent> = {
  "bookings:read": CalendarDays,
  "bookings:write": CalendarPlus,
  "marketplace:read": Search,
  "business:read": Store,
  "business:write": ClipboardCheck,
};

/** "claude.ai" from "https://claude.ai/…", or null. */
export function urlHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

function connectAi() {
  router.push({ pathname: "/connect-ai", params: { server: "customer" } });
}

/**
 * `/my/connected-apps`: the AI assistants and apps the person allowed to use their account, what each may do, and
 * Disconnect (they lose access straight away); what they may do without asking; and connecting another.
 */
export function ConnectedAppsScreen() {
  const apps = useConnectedApps();
  const refetch = apps.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);
  const timeZone = viewerTimeZone();
  return (
    <>
      <Stack.Screen options={{ title: "Connected apps" }} />
      <ScreenScroll testID="connected-apps" refreshing={refreshing} onRefresh={() => void onRefresh()}>
        <Text variant="body" tone="muted">
          Apps and AI assistants you've allowed to use your bookanything account. Disconnect one and it loses
          access straight away.
        </Text>
        {apps.isError && !apps.data ? (
          <ErrorState error={apps.error} onRetry={() => void refetch()} />
        ) : !apps.data ? (
          <View
            style={styles.list}
            accessible
            accessibilityLabel="Loading connected apps"
            accessibilityRole="progressbar"
          >
            <Skeleton height={128} radius="2xl" />
            <Skeleton height={128} radius="2xl" />
          </View>
        ) : apps.data.length === 0 ? (
          <Card>
            <EmptyState
              testID="connected-apps-empty"
              icon={Plug}
              title="No connected apps"
              description="When you connect an AI assistant such as Claude or ChatGPT to bookanything, it shows up here with what it's allowed to do. You can disconnect it at any time."
              action={{ label: "Use bookanything in your AI assistant", onPress: connectAi }}
            />
          </Card>
        ) : (
          <>
            <View style={styles.list}>
              {apps.data.map((app) => (
                <AppCard key={app.id} app={app} timeZone={timeZone} />
              ))}
            </View>
            <AgentSettings />
            <Button
              testID="connect-another"
              variant="secondary"
              icon={Plug}
              label="Connect another AI assistant"
              onPress={connectAi}
            />
          </>
        )}
      </ScreenScroll>
    </>
  );
}

function AppCard({ app, timeZone }: { app: ConnectedApp; timeZone: string }) {
  const toast = useToast();
  const revoke = useRevokeConnectedApp();
  const website = urlHost(app.clientUri);
  const disconnect = () =>
    Alert.alert(
      `Disconnect ${app.name}?`,
      app.audience === "business"
        ? `${app.name} will lose access to your businesses straight away. What it already changed stays as it is, and you can connect it again from the app at any time.`
        : `${app.name} will lose access to your bookanything account straight away. Your bookings stay as they are, and you can connect it again from the app at any time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () =>
            revoke.mutate(app.id, {
              onSuccess: () => toast.show(`${app.name} disconnected`),
              onError: (err) =>
                toast.show(
                  errorMessage(err, `We couldn't disconnect ${app.name}. Please try again.`),
                  "danger",
                ),
            }),
        },
      ],
    );
  return (
    <Card testID={`app-${app.id}`}>
      <View style={styles.top}>
        <BusinessAvatar name={app.name} size={44} />
        <View style={styles.flex}>
          <Text variant="headline">{app.name}</Text>
          <Badge
            label={app.audience === "business" ? "Your businesses" : "Your bookings"}
            tone={app.audience === "business" ? "brand" : "neutral"}
          />
        </View>
      </View>
      <View style={styles.meta}>
        {website ? <Meta icon={Globe} text={website} /> : null}
        <Meta icon={CornerDownLeft} text={`Returns to ${app.redirectHost}`} />
      </View>
      {app.scopes.length > 0 ? (
        <View style={styles.scopes} accessibilityLabel="Permissions">
          {app.scopes.map((scope) => (
            <View
              key={scope.key}
              style={styles.scope}
              accessible
              accessibilityLabel={`${scope.label}: ${scope.description}`}
            >
              <Icon icon={SCOPE_ICONS[scope.key] ?? KeyRound} size={16} color="brand" />
              <View style={styles.flex}>
                <Text variant="callout" weight="medium">
                  {scope.label}
                </Text>
                <Text variant="footnote" tone="muted">
                  {scope.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <Text variant="footnote" tone="subtle" style={styles.gap}>
        {formatConnectedAt(app.connectedAt, timeZone)} · {formatLastUsed(app.lastUsedAt, timeZone)}
      </Text>
      <View style={styles.gap}>
        <Button
          testID={`disconnect-${app.id}`}
          variant="secondary"
          size="sm"
          icon={Unplug}
          label="Disconnect"
          accessibilityLabel={`Disconnect ${app.name}`}
          loading={revoke.isPending}
          onPress={disconnect}
        />
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: IconComponent; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon icon={icon} size={14} color="subtleForeground" />
      <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  top: { flexDirection: "row", alignItems: "center", gap: space[3] },
  flex: { flex: 1, gap: space[0.5] },
  meta: { gap: space[1], marginTop: space[3] },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  scopes: { gap: space[2.5], marginTop: space[3] },
  scope: { flexDirection: "row", gap: space[2.5], alignItems: "flex-start" },
  gap: { marginTop: space[3] },
});
