"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgePercent,
  CircleAlert,
  CircleCheck,
  CreditCard,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import {
  useCompleteConnectExisting,
  useConnectExistingPayments,
  useConnectPayments,
  useDisconnectPayments,
  usePaymentsStatus,
} from "@/lib/api/hooks";
import type { PaymentsStatus } from "@/lib/api/types";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import {
  CONNECT_PATHS,
  connectMessage,
  connectReturn,
  disconnectWarning,
  type ConnectMessage,
} from "@/lib/payments/stripe-connect";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { currentPageUrl, SettingsCard, SettingsHeader, StatusLine } from "./settings-common";

const STRIPE_DASHBOARD = "https://dashboard.stripe.com";

type Path = "existing" | "create";

export function PaymentsSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const status = usePaymentsStatus(business.id);
  const connect = useConnectPayments(business.id);
  const connectExisting = useConnectExistingPayments(business.id);
  const disconnect = useDisconnectPayments(business.id);
  const { message: outcome, completing } = useConnectReturn(business.id, business.currency);
  const [starting, setStarting] = useState<Path | null>(null);
  const s = status.data;

  const start = async (path: Path) => {
    setStarting(path);
    try {
      const mutation = path === "existing" ? connectExisting : connect;
      const { url } = await mutation.mutateAsync({ returnUrl: currentPageUrl() });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setStarting(null);
    }
  };

  const doDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast.success("Stripe is disconnected.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <SettingsHeader segment="payments" />
      <div className="flex flex-col gap-6">
        {completing && (
          <div role="status">
            <StatusLine
              tone="info"
              icon={<Spinner />}
              title="Connecting your Stripe account"
              text="This takes a moment."
            />
          </div>
        )}
        {outcome && (
          <div role={outcome.tone === "error" ? "alert" : "status"}>
            <StatusLine
              tone={outcome.tone === "success" ? "success" : "warning"}
              icon={outcome.tone === "success" ? <CircleCheck /> : <CircleAlert />}
              title={outcome.tone === "success" ? "Connected" : "Stripe wasn't connected"}
              text={outcome.message}
            />
          </div>
        )}
        {status.isError ? (
          <ErrorState error={status.error} onRetry={() => status.refetch()} />
        ) : status.isPending ? (
          <Skeleton className="h-44 rounded-xl" />
        ) : s!.provider === "none" ? (
          <SettingsCard
            title="Payments aren't available yet"
            description="This server isn't set up to take card payments."
          >
            <StatusLine
              tone="neutral"
              icon={<Plug />}
              title="Not configured"
              text="Services can still be free or paid at the venue. Online payment will appear here once it's switched on for your account."
            />
          </SettingsCard>
        ) : s!.provider === "dev" ? (
          <SettingsCard
            title="Test payments"
            description="You're on a development server. Checkouts use a pretend payment page — no real money moves."
          >
            <StatusLine
              tone="info"
              icon={<FlaskConical />}
              title="Test mode is on"
              text="Try the full flow: book a paid service on your page and you'll see a test checkout where you can succeed or cancel the payment."
            />
          </SettingsCard>
        ) : s!.connected ? (
          <ConnectedCard
            s={s!}
            canManage={perms.managePayments}
            businessName={business.name}
            updating={connect.isPending}
            onUpdate={() => void start("create")}
            disconnecting={disconnect.isPending}
            onDisconnect={doDisconnect}
          />
        ) : (
          <SettingsCard
            title="Connect Stripe"
            description="Take deposits and full payments when people book. Stripe handles cards, Apple Pay and Google Pay."
          >
            <StatusLine
              tone="neutral"
              icon={<CreditCard />}
              title="Not connected"
              text={
                s!.canConnectExisting
                  ? "Use the Stripe account you already have, or create a new one."
                  : "Takes about five minutes. You'll need your bank details and ID."
              }
            />
            {!perms.managePayments ? (
              <p className="text-sm text-muted-foreground">Only an owner can connect payments.</p>
            ) : s!.canConnectExisting ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <PathChoice
                  icon={<KeyRound />}
                  {...CONNECT_PATHS.existing}
                  loading={starting === "existing"}
                  disabled={starting !== null}
                  onClick={() => void start("existing")}
                />
                <PathChoice
                  icon={<Sparkles />}
                  {...CONNECT_PATHS.create}
                  loading={starting === "create"}
                  disabled={starting !== null}
                  onClick={() => void start("create")}
                />
              </div>
            ) : (
              <Button
                variant="primary"
                className="self-start"
                loading={connect.isPending}
                onClick={() => void start("create")}
              >
                Connect with Stripe
              </Button>
            )}
          </SettingsCard>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Note
            icon={<BadgePercent />}
            title="0% platform fee"
            text="We never take a cut of your bookings. You only pay Stripe's standard card fees."
          />
          <Note
            icon={<ShieldCheck />}
            title="You're the merchant"
            text="Money goes to your own Stripe account, and your name appears on statements."
          />
        </div>
      </div>
    </>
  );
}

/**
 * Stripe's return to this page (`?stripe=complete|connect_error`), handled once: finishing the connection signed in, or
 * saying why it stopped. The query is then removed, so a reload doesn't repeat it.
 */
function useConnectReturn(businessId: string, currency: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const complete = useCompleteConnectExisting(businessId);
  // Read once: the query is removed below.
  const [back] = useState(() => connectReturn(new URLSearchParams(params.toString())));
  const [message, setMessage] = useState<ConnectMessage | null>(() =>
    back?.kind === "outcome" ? connectMessage(back.outcome, back.currency, currency) : null,
  );
  const handled = useRef(false);
  const { mutateAsync } = complete;
  useEffect(() => {
    if (params.has("stripe")) router.replace(pathname);
  }, [params, pathname, router]);
  useEffect(() => {
    if (handled.current || back?.kind !== "complete") return;
    handled.current = true;
    mutateAsync({ code: back.code, state: back.state }).then(
      (r) => setMessage(connectMessage(r.outcome, r.currency, currency)),
      (err: unknown) => setMessage({ tone: "error", message: errorMessage(err) }),
    );
  }, [back, currency, mutateAsync]);
  return { message, completing: complete.isPending };
}

function ConnectedCard({
  s,
  canManage,
  businessName,
  updating,
  onUpdate,
  disconnecting,
  onDisconnect,
}: {
  s: PaymentsStatus;
  canManage: boolean;
  businessName: string;
  updating: boolean;
  onUpdate: () => void;
  disconnecting: boolean;
  onDisconnect: () => Promise<void>;
}) {
  const oauth = s.connectMethod === "oauth";
  const account = s.accountName ?? s.accountId;
  const dashboardLink = (
    <Button asChild variant={s.chargesEnabled ? "secondary" : "primary"}>
      <a href={STRIPE_DASHBOARD} target="_blank" rel="noreferrer">
        Open Stripe dashboard
        <ExternalLink />
      </a>
    </Button>
  );
  return (
    <SettingsCard
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
          icon={<CircleCheck />}
          title="Ready to take payments"
          text="Refunds for cancellations are sent automatically, following your booking policies."
        />
      ) : (
        <StatusLine
          tone="warning"
          icon={<CircleAlert />}
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
      {account && (
        <p className="text-sm text-muted-foreground">
          Stripe account <span className="font-medium text-foreground">{account}</span>
          {oauth ? " · connected from your existing Stripe account" : ""}
        </p>
      )}
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {oauth ? (
            dashboardLink
          ) : (
            <Button
              variant={s.chargesEnabled ? "secondary" : "primary"}
              loading={updating}
              onClick={onUpdate}
            >
              {s.chargesEnabled ? "Update Stripe details" : "Continue setup"}
            </Button>
          )}
          <ConfirmDialog
            trigger={<Button variant="danger-ghost">Disconnect</Button>}
            title="Disconnect Stripe?"
            description={disconnectWarning(businessName, oauth)}
            confirmLabel="Disconnect"
            destructive
            loading={disconnecting}
            onConfirm={onDisconnect}
          />
        </div>
      ) : (
        !s.chargesEnabled && (
          <p className="text-sm text-muted-foreground">Only an owner can connect payments.</p>
        )
      )}
    </SettingsCard>
  );
}

/** One way to connect: a large button with an icon, a title and what it involves. */
function PathChoice({
  icon,
  title,
  text,
  loading,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-xs transition-colors",
        "hover:border-border-strong hover:bg-accent",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60 dark:bg-surface-raised",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground [&_svg]:size-4.5">
        {loading ? <Spinner /> : icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

function Note({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-brand [&_svg]:size-4.5">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
