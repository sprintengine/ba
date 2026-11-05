"use client";

import { useState } from "react";
import { ArrowLeftRight, CircleCheck, CornerDownLeft, Globe, Store, TriangleAlert } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useAuthorizeDecision } from "@/lib/api/hooks";
import type { AuthorizeCheck, AuthorizeRequest, ConsentBusiness } from "@/lib/api/types";
import { signInUrl } from "@/lib/auth/components";
import { useAuth } from "@/lib/auth/context";
import { CONNECTED_APPS_PATH, urlHost } from "@/lib/oauth/app-url";
import { LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { ScopeList } from "./scope-list";

export type Consent = Extract<AuthorizeCheck, { type: "consent" }>;

/**
 * The consent screen: who is asking, what they may do, where you go next, Allow / Cancel. A business-server request
 * (`audience: business`) also lists the businesses the app will reach and says that every change waits for the user.
 */
export function ConsentCard({
  consent,
  request,
  returnPath,
}: {
  consent: Consent;
  request: AuthorizeRequest;
  /** This exact consent URL, to come back to after switching account. */
  returnPath: string;
}) {
  const { client, scopes, user, previouslyApproved, audience, businesses = [] } = consent;
  const forBusiness = audience === "business";
  const decision = useAuthorizeDecision();
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const busy = decision.isPending || leaving;
  const website = urlHost(client.uri);

  async function decide(approve: boolean) {
    setChoice(approve ? "allow" : "deny");
    try {
      const { redirectTo } = await decision.mutateAsync({ request, approve });
      setLeaving(true);
      window.location.assign(redirectTo);
    } catch (err) {
      setChoice(null);
      toast.error(errorMessage(err, "We couldn't finish connecting. Please try again."));
    }
  }

  return (
    <Card variant="panel" className="animate-rise rounded-2xl shadow-sm">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        <header className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-3" aria-hidden>
            <Avatar name={client.name} size="xl" shape="square" className="shadow-xs" />
            <ArrowLeftRight className="size-4 text-subtle-foreground" />
            <span className="flex size-14 items-center justify-center rounded-[28%] border border-border bg-surface shadow-xs">
              <LogoMark className="size-9" title="" />
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              <span className="text-foreground">{client.name}</span>{" "}
              <span className="text-muted-foreground">
                {forBusiness
                  ? "wants to help run your business on bookanything"
                  : "wants to use your bookanything account"}
              </span>
            </h1>
            {website && client.uri && (
              <a
                href={client.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Globe className="size-3.5" aria-hidden />
                {website}
              </a>
            )}
            {previouslyApproved && <Badge tone="info">You&apos;ve connected this app before</Badge>}
          </div>
        </header>

        <RedirectNotice host={client.redirectHost} />
        {client.localOnly && <LocalOnlyWarning />}

        <section aria-labelledby="consent-scopes" className="flex flex-col gap-3">
          <h2 id="consent-scopes" className="text-sm font-medium text-muted-foreground">
            This will let {client.name}:
          </h2>
          <ScopeList scopes={scopes} />
        </section>

        {forBusiness && <BusinessReach businesses={businesses} />}

        <SignedInAs name={user.name} email={user.email} returnPath={returnPath} disabled={busy} />

        <p className="text-xs text-subtle-foreground">
          You can disconnect {client.name} at any time in{" "}
          <a
            href={CONNECTED_APPS_PATH}
            target="_blank"
            rel="noopener"
            className="text-brand underline-offset-4 hover:underline"
          >
            Connected apps
          </a>
          .
        </p>
      </CardContent>
      <CardFooter className="flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
        <Button
          size="lg"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={busy}
          loading={busy && choice === "deny"}
          onClick={() => decide(false)}
        >
          Cancel
        </Button>
        <Button
          size="lg"
          variant="primary"
          className="w-full sm:w-auto sm:min-w-32"
          disabled={busy}
          loading={busy && choice === "allow"}
          onClick={() => decide(true)}
        >
          Allow
        </Button>
      </CardFooter>
    </Card>
  );
}

/** The businesses a business-server connection reaches, the user's role at each, and how changes are confirmed. */
function BusinessReach({ businesses }: { businesses: ConsentBusiness[] }) {
  return (
    <section aria-labelledby="consent-businesses" className="flex flex-col gap-3">
      <h2 id="consent-businesses" className="text-sm font-medium text-muted-foreground">
        As you, with your role at these businesses and any you join later:
      </h2>
      <ul className="flex flex-col gap-2">
        {businesses.map((b) => (
          <li
            key={b.slug}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-sunken/60 px-4 py-2.5 text-sm"
          >
            <Store className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
            {!b.aiAgentsAllowed && <Badge tone="warning">Not allowed yet</Badge>}
            <Badge tone="neutral">{ROLE_LABELS[b.role]}</Badge>
          </li>
        ))}
      </ul>
      {businesses.some((b) => !b.aiAgentsAllowed) && (
        <p className="text-sm text-muted-foreground">
          Where it says not allowed yet, the owner needs to let you use AI agents in Settings › AI agents
          before the app can use that business.
        </p>
      )}
      <p className="flex gap-2 text-sm text-muted-foreground">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          It can look things up straight away. A change, like a booking, a cancellation or blocked time, is
          only prepared: you approve it on bookanything before it happens, unless the owner lets agents make
          that kind of change once you say yes in the app. Only allow apps you trust.
        </span>
      </p>
    </section>
  );
}

const ROLE_LABELS: Record<ConsentBusiness["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

function RedirectNotice({ host }: { host: string }) {
  return (
    <p className="flex items-center gap-3 rounded-xl border border-border bg-surface-sunken px-4 py-3 text-sm">
      <CornerDownLeft className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
      <span className="min-w-0">
        You&apos;ll be sent back to{" "}
        <strong className="font-mono font-semibold [overflow-wrap:anywhere] text-foreground">{host}</strong>
      </span>
    </p>
  );
}

function LocalOnlyWarning() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong className="font-semibold">This app runs on your device.</strong> Only continue if you just
        started this from an app on this device.
      </p>
    </div>
  );
}

function SignedInAs({
  name,
  email,
  returnPath,
  disabled,
}: {
  name: string | null;
  email: string | null;
  returnPath: string;
  disabled: boolean;
}) {
  const { signOut } = useAuth();
  const display = name ?? email ?? "your account";
  return (
    <div className="flex items-center gap-3 border-t border-border-subtle pt-5">
      <Avatar name={display} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-subtle-foreground">Signed in as</span>
        {/* Shown in full (wrapped, not cut short): which account is being connected matters here. */}
        <span className="text-sm font-medium [overflow-wrap:anywhere]">{display}</span>
        {name && email && (
          <span className="text-xs [overflow-wrap:anywhere] text-muted-foreground">{email}</span>
        )}
      </div>
      <Button
        variant="link"
        size="sm"
        disabled={disabled}
        onClick={() => void signOut({ redirectUrl: signInUrl(returnPath) })}
        className="shrink-0"
      >
        Switch account
      </Button>
    </div>
  );
}
