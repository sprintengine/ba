import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import {
  BadgePercent,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FlaskConical,
  KeyRound,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import type { PaymentsStatus } from "@shared/api/types";
import {
  useCompleteConnectExisting,
  useConnectExistingPayments,
  useConnectPayments,
  useDisconnectPayments,
  usePaymentsStatus,
} from "@shared/api/hooks/use-payments";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import {
  CONNECT_PATHS,
  connectMessage,
  connectReturn,
  disconnectWarning,
} from "@shared/payments/stripe-connect";
import { useRefetchOnFocus } from "~/api/use-refresh";
import { websiteUrl } from "~/lib/links";
import { Button, ErrorState, ListRow, Section, Skeleton, Text, useToast } from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { StatusLine } from "../StatusLine";
import { Note } from "./Note";

const STRIPE_DASHBOARD = "https://dashboard.stripe.com";

const LINK_KEYS = ["stripe", "code", "state", "reason"] as const;
type LinkParams = Partial<Record<(typeof LINK_KEYS)[number], string>>;

/** States whose answer this app already used (per launch): a code is spent the first time. */
const answered = new Set<string>();
function claimAnswer(state: string): boolean {
  if (answered.has(state)) return false;
  answered.add(state);
  return true;
}

type Path = "existing" | "create";

/**
 * Settings › Payments (the website's PaymentsSettings): Stripe Connect's state and, for owners, connecting it (an
 * account they already have, or a new one), updating or disconnecting it. Stripe's pages open over the app and come
 * back to the website's payments page: connecting an existing account runs in an authentication session, which hands
 * Stripe's answer back to the app to finish signed in; onboarding a new one runs in the in-app browser. The status is
 * read again when either closes.
 */
export function PaymentsSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const status = usePaymentsStatus(business.id);
  const connect = useConnectPayments(business.id);
  const connectExisting = useConnectExistingPayments(business.id);
  const complete = useCompleteConnectExisting(business.id);
  const disconnect = useDisconnectPayments(business.id);
  const feedback = useSaveFeedback();
  const toast = useToast();
  const [starting, setStarting] = useState<Path | null>(null);
  useRefetchOnFocus(status.refetch);

  const returnUrl = websiteUrl(`/dashboard/${business.slug}/settings/payments`);

  /** Finishes connecting with what Stripe's answer carried (`?stripe=complete|connect_error`), and says how it ended. */
  const finish = async (params: URLSearchParams) => {
    const back = connectReturn(params);
    // The same answer can reach us twice (the session's result and the link opening this screen): once is enough.
    if (!back || (back.kind === "complete" && !claimAnswer(back.state))) return;
    let outcome = back.kind === "outcome" ? back : null;
    if (back.kind === "complete") {
      try {
        outcome = {
          kind: "outcome",
          ...(await complete.mutateAsync({ code: back.code, state: back.state })),
        };
      } catch (err) {
        feedback.failed(err);
        return;
      }
    }
    if (!outcome) return;
    const said = connectMessage(outcome.outcome, outcome.currency, business.currency);
    if (said.tone === "success") feedback.saved(said.message);
    else toast.show(said.message, "danger");
  };
  const finishFromLink = useEffectEvent((params: URLSearchParams) => void finish(params));

  // Opened from a link carrying Stripe's answer (the website's payments page is an app link): finish it here.
  const link = useLocalSearchParams<LinkParams>();
  const seenLink = useRef<string | null>(null);
  useEffect(() => {
    if (!link.stripe) return;
    const params = new URLSearchParams();
    for (const key of LINK_KEYS) {
      const value = link[key];
      if (typeof value === "string") params.set(key, value);
    }
    // Once per answer, even if the screen renders again with the same link.
    if (seenLink.current === params.toString()) return;
    seenLink.current = params.toString();
    finishFromLink(params);
  }, [link]);

  const start = async (path: Path) => {
    setStarting(path);
    try {
      const mutation = path === "existing" ? connectExisting : connect;
      const { url } = await mutation.mutateAsync({ returnUrl });
      if (path === "existing" && returnUrl.startsWith("https://")) {
        // The website's https address (an associated domain) closes the session and gives us Stripe's answer.
        const result = await WebBrowser.openAuthSessionAsync(url, returnUrl, { preferUniversalLinks: true });
        if (result.type === "success") await finish(new URL(result.url).searchParams);
      } else {
        // Resolves when the person closes the browser (or Stripe sends them back to the website's page).
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (err) {
      feedback.failed(err);
    } finally {
      setStarting(null);
      await status.refetch();
    }
  };

  const openDashboard = () => void WebBrowser.openBrowserAsync(STRIPE_DASHBOARD).catch(() => undefined);

  const confirmDisconnect = (oauth: boolean) =>
    Alert.alert("Disconnect Stripe?", disconnectWarning(business.name, oauth), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => void feedback.run(() => disconnect.mutateAsync(), "Stripe is disconnected"),
      },
    ]);

  return (
    <SettingsPage segment="payments">
      {status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : status.isPending ? (
        <View accessibilityLabel="Loading payments" testID="payments-loading">
          <Skeleton height={176} radius="2xl" />
        </View>
      ) : (
        <StatusCard
          s={status.data}
          canManage={perms.managePayments}
          starting={starting}
          onStart={(path) => void start(path)}
          onOpenDashboard={openDashboard}
          disconnecting={disconnect.isPending}
          onDisconnect={confirmDisconnect}
        />
      )}
      <View style={styles.notes}>
        <Note
          icon={BadgePercent}
          title="0% platform fee"
          text="We never take a cut of your bookings. You only pay Stripe's standard card fees."
        />
        <Note
          icon={ShieldCheck}
          title="You're the merchant"
          text="Money goes to your own Stripe account, and your name appears on statements."
        />
      </View>
    </SettingsPage>
  );
}

function StatusCard({
  s,
  canManage,
  starting,
  onStart,
  onOpenDashboard,
  disconnecting,
  onDisconnect,
}: {
  s: PaymentsStatus;
  canManage: boolean;
  starting: Path | null;
  onStart: (path: Path) => void;
  onOpenDashboard: () => void;
  disconnecting: boolean;
  onDisconnect: (oauth: boolean) => void;
}) {
  if (s.provider === "none") {
    return (
      <Section
        title="Payments aren't available yet"
        description="This server isn't set up to take card payments."
      >
        <StatusLine
          tone="neutral"
          icon={Plug}
          title="Not configured"
          text="Services can still be free or paid at the venue. Online payment will appear here once it's switched on for your account."
        />
      </Section>
    );
  }
  if (s.provider === "dev") {
    return (
      <Section
        title="Test payments"
        description="You're on a development server. Checkouts use a pretend payment page — no real money moves."
      >
        <StatusLine
          tone="info"
          icon={FlaskConical}
          title="Test mode is on"
          text="Try the full flow: book a paid service on your page and you'll see a test checkout where you can succeed or cancel the payment."
        />
      </Section>
    );
  }
  if (s.connected) {
    const oauth = s.connectMethod === "oauth";
    const account = s.accountName ?? s.accountId;
    return (
      <Section
        title={s.chargesEnabled ? "Stripe is connected" : "Connect Stripe"}
        description={
          s.chargesEnabled
            ? "Payments go straight to your Stripe account."
            : "Take deposits and full payments when people book. Stripe handles cards, Apple Pay and Google Pay."
        }
      >
        {s.chargesEnabled ? (
          <StatusLine
            tone="success"
            icon={CircleCheck}
            title="Ready to take payments"
            text="Refunds for cancellations are sent automatically, following your booking policies."
          />
        ) : (
          <StatusLine
            tone="warning"
            icon={CircleAlert}
            title="Almost there"
            text={
              s.detailsSubmitted
                ? "Stripe is reviewing your details. This usually takes a few minutes."
                : oauth
                  ? "Finish setting up your account in your Stripe dashboard to start taking payments."
                  : "Finish your Stripe setup to start taking payments."
            }
          />
        )}
        {account ? (
          <Text variant="callout" tone="muted">
            {`Stripe account ${account}${oauth ? " · connected from your existing Stripe account" : ""}`}
          </Text>
        ) : null}
        {canManage ? (
          <View style={styles.actions}>
            {oauth ? (
              <Button
                testID="payments-dashboard"
                label="Open Stripe dashboard"
                variant={s.chargesEnabled ? "secondary" : "brand"}
                onPress={onOpenDashboard}
              />
            ) : (
              <Button
                testID="payments-connect"
                label={s.chargesEnabled ? "Update Stripe details" : "Continue setup"}
                variant={s.chargesEnabled ? "secondary" : "brand"}
                loading={starting === "create"}
                onPress={() => onStart("create")}
              />
            )}
            <Button
              testID="payments-disconnect"
              label="Disconnect"
              variant="ghost"
              loading={disconnecting}
              onPress={() => onDisconnect(oauth)}
            />
          </View>
        ) : !s.chargesEnabled ? (
          <Text variant="callout" tone="muted">
            Only an owner can connect payments.
          </Text>
        ) : null}
      </Section>
    );
  }
  return (
    <Section
      title="Connect Stripe"
      description="Take deposits and full payments when people book. Stripe handles cards, Apple Pay and Google Pay."
    >
      <StatusLine
        tone="neutral"
        icon={CreditCard}
        title="Not connected"
        text={
          s.canConnectExisting
            ? "Use the Stripe account you already have, or create a new one."
            : "Takes about five minutes. You'll need your bank details and ID."
        }
      />
      {!canManage ? (
        <Text variant="callout" tone="muted">
          Only an owner can connect payments.
        </Text>
      ) : s.canConnectExisting ? (
        <View>
          <ListRow
            testID="payments-connect-existing"
            icon={KeyRound}
            title={CONNECT_PATHS.existing.title}
            subtitle={CONNECT_PATHS.existing.text}
            onPress={starting ? undefined : () => onStart("existing")}
            trailing={
              starting === "existing" ? <ActivityIndicator accessibilityLabel="Opening Stripe" /> : undefined
            }
            chevron={!starting}
          />
          <ListRow
            testID="payments-connect-create"
            icon={Sparkles}
            title={CONNECT_PATHS.create.title}
            subtitle={CONNECT_PATHS.create.text}
            onPress={starting ? undefined : () => onStart("create")}
            trailing={
              starting === "create" ? <ActivityIndicator accessibilityLabel="Opening Stripe" /> : undefined
            }
            chevron={!starting}
          />
        </View>
      ) : (
        <Button
          testID="payments-connect"
          label="Connect with Stripe"
          variant="brand"
          loading={starting === "create"}
          onPress={() => onStart("create")}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  notes: { gap: space[3] },
  actions: { gap: space[2] },
});
