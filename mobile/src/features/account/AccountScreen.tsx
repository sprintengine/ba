import Constants from "expo-constants";
import { useState, type ReactNode } from "react";
import { router, Stack } from "expo-router";
import { Alert, Linking, StyleSheet, View } from "react-native";
import {
  Bell,
  Bot,
  CircleCheckBig,
  FileText,
  LogOut,
  Mail,
  Plug,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useNotificationSettings, useUpdateNotificationSettings } from "@shared/api/hooks/use-notifications";
import type { Me, NotificationKind, NotificationSetting } from "@shared/api/types";
import { useAuth } from "@shared/auth/context";
import { useAccountDeletion } from "~/auth/account-deletion";
import { env } from "~/config/env";
import { openWebsite } from "~/lib/links";
import { logError } from "~/lib/logger";
import { rememberVisit, useSignedInMe } from "~/shell/session";
import {
  BusinessAvatar,
  Card,
  Divider,
  ErrorState,
  ListRow,
  ScreenScroll,
  Skeleton,
  Switch,
  Text,
  useToast,
} from "~/ui";
import { space } from "~/ui/tokens";
import { AgentSettings } from "~/features/connected-apps/AgentSettings";
import { DeleteAccountSheet } from "./DeleteAccountSheet";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", staff: "Staff" } as const;

/** Where people ask for their account and data to be erased when the app can't (the privacy notice's contact). */
export const PRIVACY_EMAIL = "hello@bookanything.ie";

/** The kinds this person can be emailed about: customers' kinds, and the team's for members of a business. */
export function emailKinds(items: NotificationSetting[], isMember: boolean): NotificationSetting[] {
  return items.filter((k) => k.forCustomers || (isMember && k.forMembers));
}

/**
 * `/my`: who's signed in, their businesses, which notifications are also emailed, what their AI apps may do without
 * asking, connected apps, the legal pages, deleting the account, and signing out.
 */
export function AccountScreen() {
  const { user, signOut } = useAuth();
  const me = useSignedInMe();
  const memberships = me.data?.memberships ?? [];
  const email = me.data?.user.email ?? user?.email ?? null;

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You'll need to sign in again to see your bookings.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: "Account", headerLargeTitle: true }} />
      <ScreenScroll testID="account">
        <Card testID="account-profile">
          <Text variant="title3">{me.data?.user.name ?? user?.name ?? "Signed in"}</Text>
          <Text variant="callout" tone="muted">
            {me.data?.user.email ?? user?.email}
          </Text>
        </Card>

        {memberships.length > 0 ? (
          <Section title="YOUR BUSINESSES">
            <Card padding={0}>
              {memberships.map((m, i) => (
                <View key={m.businessId}>
                  {i > 0 ? <Divider inset={space[16]} /> : null}
                  <ListRow
                    testID={`account-business-${m.slug}`}
                    leading={
                      <BusinessAvatar
                        name={m.name}
                        logoUrl={m.branding.logoUrl}
                        color={m.branding.primaryColor}
                      />
                    }
                    title={m.name}
                    subtitle={ROLE_LABEL[m.role]}
                    onPress={() => {
                      rememberVisit("business", m.slug);
                      router.navigate(`/dashboard/${m.slug}`);
                    }}
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title="SETTINGS">
          <Card padding={0}>
            <ListRow icon={Bell} title="Notifications" onPress={() => router.push("/my/notifications")} />
            <Divider inset={space[12]} />
            <ListRow
              icon={CircleCheckBig}
              title="Approvals"
              subtitle="What your AI apps asked to do"
              onPress={() => router.navigate("/my/approvals")}
            />
            <Divider inset={space[12]} />
            <ListRow icon={Plug} title="Connected apps" onPress={() => router.push("/my/connected-apps")} />
            <Divider inset={space[12]} />
            <ListRow
              icon={Bot}
              title="Use bookanything in ChatGPT or Claude"
              onPress={() => router.push({ pathname: "/connect-ai", params: { server: "customer" } })}
            />
          </Card>
        </Section>

        <EmailSettings isMember={memberships.length > 0} email={email} />

        <AgentSettings />

        <Section title="ABOUT">
          <Card padding={0}>
            <ListRow icon={FileText} title="Terms" onPress={() => void openWebsite("/legal/terms")} />
            <Divider inset={space[12]} />
            <ListRow
              icon={ShieldCheck}
              title="Privacy notice"
              onPress={() => void openWebsite("/legal/privacy")}
            />
          </Card>
        </Section>

        <DeleteAccount email={email} memberships={memberships} />

        <Card padding={0}>
          <ListRow
            testID="sign-out"
            icon={LogOut}
            title="Sign out"
            destructive
            chevron={false}
            onPress={confirmSignOut}
          />
        </Card>

        <Text variant="footnote" tone="subtle" align="center">
          bookanything {Constants.expoConfig?.version ?? ""} · {env.variant}
          {env.variant === "development" ? ` · ${env.apiUrl}` : ""}
        </Text>
      </ScreenScroll>
    </>
  );
}

/**
 * Deleting the account in the app (App Store 5.1.1(v), Google Play's policy), when the auth provider can (Clerk);
 * otherwise why not, and the email that does it.
 */
function DeleteAccount({ email, memberships }: { email: string | null; memberships: Me["memberships"] }) {
  const deletion = useAccountDeletion();
  const [open, setOpen] = useState(false);
  return (
    <Card testID="delete-account">
      <Text variant="headline" accessibilityRole="header">
        Delete your account
      </Text>
      <Text variant="callout" tone="muted" style={styles.gap}>
        {deletion.available
          ? "Permanently delete your account and what we hold about you, and sign out. The businesses you booked with keep their own booking records."
          : `${deletion.reason} Email us from ${email ?? "your account's email"} and we'll delete your account and what we hold about you.`}
      </Text>
      <View style={styles.gap}>
        {deletion.available ? (
          <ListRow
            testID="delete-account-open"
            icon={Trash2}
            title="Delete account"
            destructive
            chevron={false}
            onPress={() => setOpen(true)}
          />
        ) : (
          <ListRow
            testID="delete-account-email"
            icon={Mail}
            title="Ask us to delete your account"
            chevron={false}
            onPress={() =>
              void Linking.openURL(
                `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent("Delete my bookanything account")}`,
              ).catch((e: unknown) => logError(e, { link: "mailto" }))
            }
          />
        )}
      </View>
      {deletion.available ? (
        <DeleteAccountSheet
          visible={open}
          onClose={() => setOpen(false)}
          email={email}
          memberships={memberships}
          deleteAccount={deletion.deleteAccount}
        />
      ) : null}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone="subtle" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** "Email me about": which notifications are also emailed (the website's /my/notifications email choices). */
function EmailSettings({ isMember, email }: { isMember: boolean; email: string | null }) {
  const toast = useToast();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const kinds = settings.data ? emailKinds(settings.data.items, isMember) : [];
  const toggle = (kind: NotificationKind, on: boolean) =>
    update.mutate(
      { [kind]: on },
      {
        onSuccess: () => toast.show(on ? "You'll get these by email" : "No more emails for these"),
        onError: (err) => toast.show(errorMessage(err), "danger"),
      },
    );
  return (
    <Card testID="email-settings">
      <Text variant="headline" accessibilityRole="header">
        Email me about
      </Text>
      <Text variant="callout" tone="muted" style={styles.description}>
        Sent to {email ?? "your account email"}, a minute later, unless you've opened it in the app by then.
      </Text>
      <View style={styles.list}>
        {settings.isError && !settings.data ? (
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        ) : !settings.data ? (
          <Skeleton height={56} />
        ) : (
          kinds.map((k) => (
            <Switch
              key={k.kind}
              testID={`email-${k.kind}`}
              label={k.label}
              description={k.description}
              value={k.email}
              disabled={update.isPending}
              onValueChange={(on) => toggle(k.kind, on)}
            />
          ))
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[2] },
  gap: { marginTop: space[2] },
  description: { marginTop: space[1] },
  list: { gap: space[2], marginTop: space[3] },
});
