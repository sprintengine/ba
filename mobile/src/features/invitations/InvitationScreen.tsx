import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Check, CircleAlert } from "lucide-react-native";
import { useAcceptInvitation } from "@shared/api/hooks/use-me";
import { useAuth } from "@shared/auth/context";
import { rememberVisit, useSignedInMe } from "~/shell/session";
import { Button, Icon, type IconComponent, ScreenScroll, Text, useTheme } from "~/ui";
import { layout, radius, space } from "~/ui/tokens";
import { invitationErrorView, joinedHref, joinedMembership } from "./invitation";

/** How long "You've joined" shows before the business opens. */
export const REDIRECT_MS = 1400;

type State =
  | { kind: "accepting" }
  | { kind: "joined"; slug: string | null; name: string | null }
  | { kind: "error"; error: unknown };

/**
 * `/invitations/[token]` from a team invitation email (signed in: the route sends a signed-out person to sign-in and
 * back here). Accepts once `/v1/me` has loaded (which may already have accepted it for this email; the backend then
 * answers it as joined too), then opens the business.
 */
export function InvitationScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const state = useAcceptOnce(token);
  return (
    <ScreenScroll testID="invitation">
      <Stack.Screen options={{ title: "Invitation" }} />
      {state.kind === "accepting" ? (
        <Panel busy title="Joining the team…" body="Setting up your access. This only takes a moment." />
      ) : state.kind === "joined" ? (
        <Panel
          tone="success"
          icon={Check}
          title={state.name ? `You've joined ${state.name}` : "Invitation accepted"}
          body="Taking you to the dashboard…"
        >
          <Button
            testID="invitation-open"
            variant="primary"
            label="Open dashboard"
            onPress={() => router.replace(joinedHref(state.slug))}
          />
        </Panel>
      ) : (
        <AcceptError error={state.error} />
      )}
    </ScreenScroll>
  );
}

function useAcceptOnce(token: string): State {
  const me = useSignedInMe();
  const accept = useAcceptInvitation();
  const [state, setState] = useState<State>({ kind: "accepting" });
  const started = useRef(false);
  const redirect = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (started.current || me.isPending) return;
    started.current = true;
    accept
      .mutateAsync(token)
      .then((accepted) => {
        const joined = joinedMembership(accepted);
        setState({ kind: "joined", slug: joined?.slug ?? null, name: joined?.name ?? null });
        if (joined) rememberVisit("business", joined.slug);
        redirect.current = setTimeout(() => router.replace(joinedHref(joined?.slug ?? null)), REDIRECT_MS);
      })
      .catch((error: unknown) => setState({ kind: "error", error }));
  }, [accept, me.isPending, token]);
  // Leaving first (Open dashboard, back) cancels the redirect.
  useEffect(() => () => clearTimeout(redirect.current), []);
  return state;
}

function AcceptError({ error }: { error: unknown }) {
  const { user, signOut } = useAuth();
  const me = useSignedInMe();
  const view = invitationErrorView(error, {
    hasAccess: (me.data?.memberships.length ?? 0) > 0,
    email: user?.email ?? null,
  });
  return (
    <Panel tone="warning" icon={CircleAlert} title={view.title} body={view.body}>
      {view.next === "dashboard" ? (
        <Button variant="primary" label="Go to dashboard" onPress={() => router.replace("/dashboard")} />
      ) : (
        <Button
          variant="secondary"
          label="Go to my bookings"
          onPress={() => router.replace("/my/bookings")}
        />
      )}
      {user && view.offerOtherAccount ? (
        <Button variant="ghost" label="Use a different account" onPress={() => void signOut()} />
      ) : null}
    </Panel>
  );
}

function Panel({
  icon,
  busy = false,
  title,
  body,
  tone = "brand",
  children,
}: {
  icon?: IconComponent;
  /** Working on it: a spinner instead of the icon. */
  busy?: boolean;
  title: string;
  body: string;
  tone?: "brand" | "success" | "warning";
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const look = {
    brand: { bg: colors.brandSoft, fg: "brandSoftForeground" as const },
    success: { bg: colors.successSoft, fg: "successSoftForeground" as const },
    warning: { bg: colors.warningSoft, fg: "warningSoftForeground" as const },
  }[tone];
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={[styles.icon, { backgroundColor: look.bg }]}>
        {busy ? (
          <ActivityIndicator accessibilityLabel="Accepting" color={colors[look.fg]} />
        ) : icon ? (
          <Icon icon={icon} size={22} color={look.fg} />
        ) : null}
      </View>
      <Text variant="title2" align="center">
        {title}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {body}
      </Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[16],
    maxWidth: layout.formWidth,
    alignSelf: "center",
  },
  icon: {
    width: space[12],
    height: space[12],
    borderRadius: radius["2xl"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[3],
  },
  actions: { alignItems: "center", gap: space[2], marginTop: space[4] },
});
