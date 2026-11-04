import * as WebBrowser from "expo-web-browser";
import { StyleSheet, View } from "react-native";
import {
  BadgePercent,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FlaskConical,
  Plug,
  ShieldCheck,
} from "lucide-react-native";
import type { PaymentsStatus } from "@shared/api/types";
import { useConnectPayments, usePaymentsStatus } from "@shared/api/hooks/use-payments";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { useRefetchOnFocus } from "~/api/use-refresh";
import { websiteUrl } from "~/lib/links";
import { Button, ErrorState, Section, Skeleton, Text } from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { StatusLine } from "../StatusLine";
import { Note } from "./Note";

/**
 * Settings › Payments (the website's PaymentsSettings): Stripe Connect's state, and connecting or updating it (owners)
 * in an in-app browser that returns to the website's payments page; the status is read again when it closes.
 */
export function PaymentsSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const status = usePaymentsStatus(business.id);
  const connect = useConnectPayments(business.id);
  const feedback = useSaveFeedback();
  useRefetchOnFocus(status.refetch);

  const start = async () => {
    let url: string;
    try {
      ({ url } = await connect.mutateAsync({
        returnUrl: websiteUrl(`/dashboard/${business.slug}/settings/payments`),
      }));
    } catch (err) {
      feedback.failed(err);
      return;
    }
    // Resolves when the person closes the browser (or Stripe sends them back to the website's page).
    await WebBrowser.openBrowserAsync(url).catch(() => undefined);
    await status.refetch();
  };

  const action = (label: string, variant: "brand" | "secondary") => (
    <Button
      testID="payments-connect"
      label={label}
      variant={variant}
      loading={connect.isPending}
      onPress={() => void start()}
    />
  );

  return (
    <SettingsPage segment="payments">
      {status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : status.isPending ? (
        <View accessibilityLabel="Loading payments" testID="payments-loading">
          <Skeleton height={176} radius="2xl" />
        </View>
      ) : (
        <StatusCard s={status.data} canManage={perms.managePayments} action={action} />
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
  action,
}: {
  s: PaymentsStatus;
  canManage: boolean;
  action: (label: string, variant: "brand" | "secondary") => React.ReactNode;
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
  if (s.chargesEnabled) {
    return (
      <Section title="Stripe is connected" description="Payments go straight to your Stripe account.">
        <StatusLine
          tone="success"
          icon={CircleCheck}
          title="Ready to take payments"
          text="Refunds for cancellations are sent automatically, following your booking policies."
        />
        {canManage ? action("Update Stripe details", "secondary") : null}
      </Section>
    );
  }
  return (
    <Section
      title="Connect Stripe"
      description="Take deposits and full payments when people book. Stripe handles cards, Apple Pay and Google Pay."
    >
      {s.connected ? (
        <StatusLine
          tone="warning"
          icon={CircleAlert}
          title="Almost there"
          text={
            s.detailsSubmitted
              ? "Stripe is reviewing your details. This usually takes a few minutes."
              : "Finish your Stripe setup to start taking payments."
          }
        />
      ) : (
        <StatusLine
          tone="neutral"
          icon={CreditCard}
          title="Not connected"
          text="Takes about five minutes. You'll need your bank details and ID."
        />
      )}
      {canManage ? (
        action(s.connected ? "Continue setup" : "Connect with Stripe", "brand")
      ) : (
        <Text variant="callout" tone="muted">
          Only an owner can connect payments.
        </Text>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({ notes: { gap: space[3] } });
