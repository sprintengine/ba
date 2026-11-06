"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { DeadEndMark } from "@/components/brand/logo";
import { useAcceptInvitation, useMe } from "@/lib/api/hooks";
import { signInUrl } from "@/lib/auth/components";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { invitationErrorView, joinedHref, joinedMembership } from "./invitation-state";

type State =
  | { kind: "accepting" }
  | { kind: "joined"; slug: string | null; name: string | null }
  | { kind: "error"; error: Error };

/**
 * Lands here from the invitation email (`/invitations/{token}`), always signed in
 * (RequireAuth in the layout). Accepts once, then routes to the business dashboard.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const state = useAcceptOnce(token);
  if (state.kind === "accepting") {
    return (
      <Panel icon={<Spinner className="size-5" label="Accepting" />} title="Joining the team…">
        <p>Setting up your access. This only takes a moment.</p>
      </Panel>
    );
  }
  if (state.kind === "joined") {
    return (
      <Panel
        icon={<Check className="size-5" strokeWidth={2.5} />}
        tone="success"
        title={state.name ? `You've joined ${state.name}` : "Invitation accepted"}
      >
        <p>Taking you to the dashboard…</p>
        <Button asChild variant="primary" className="mt-4">
          <Link href={joinedHref(state.slug)}>Open dashboard</Link>
        </Button>
      </Panel>
    );
  }
  return <AcceptError token={token} error={state.error} />;
}

/**
 * Accepts the invitation once `me` has loaded (which accepts invitations for the user's email first; the backend
 * then answers this one as joined too), then opens its dashboard.
 */
function useAcceptOnce(token: string): State {
  const me = useMe();
  const accept = useAcceptInvitation();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "accepting" });
  const started = useRef(false);
  const redirect = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (started.current || me.isPending) return;
    started.current = true;
    accept
      .mutateAsync(token)
      .then((accepted) => {
        const joined = joinedMembership(accepted);
        setState({ kind: "joined", slug: joined?.slug ?? null, name: joined?.name ?? null });
        redirect.current = window.setTimeout(() => router.push(joinedHref(joined?.slug ?? null)), 1400);
      })
      .catch((error: unknown) =>
        setState({ kind: "error", error: error instanceof Error ? error : new Error(String(error)) }),
      );
  }, [accept, me.isPending, router, token]);
  // Leaving first (Open dashboard, the back button) cancels the redirect.
  useEffect(() => () => window.clearTimeout(redirect.current), []);
  return state;
}

function AcceptError({ token, error }: { token: string; error: Error }) {
  const { user, signOut } = useAuth();
  const me = useMe();
  const view = invitationErrorView(error, {
    hasAccess: (me.data?.memberships.length ?? 0) > 0,
    email: user?.email ?? null,
  });
  return (
    <Panel icon={<DeadEndMark />} tone="warning" title={view.title}>
      <p>{view.body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {view.next === "dashboard" ? (
          <Button asChild variant="primary">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <Button asChild variant="primary">
            <Link href="/my/bookings">Go to my bookings</Link>
          </Button>
        )}
        {user && view.offerOtherAccount && (
          <Button
            variant="secondary"
            onClick={() => signOut({ redirectUrl: signInUrl(`/invitations/${token}`) })}
          >
            Use a different account
          </Button>
        )}
      </div>
    </Panel>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** Kept by callers for the state they mean; every state now reads the same, in words. */
  tone?: "brand" | "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md animate-rise flex-col items-center gap-4 px-6 py-24 text-center">
      <span className="text-subtle-foreground [&_svg]:size-6" aria-hidden>
        {icon}
      </span>
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-balance">{title}</h1>
        <div className="flex flex-col items-center text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
