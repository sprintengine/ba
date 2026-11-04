"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMe } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/context";
import { resolvePostSignInPath } from "@/lib/auth/components";
import { SIGN_IN_PATH } from "@/lib/auth/config";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** After sign-in: load /v1/me (links bookings, accepts invites), then route to the redirect or the user's home. */
export default function AfterSignInPage() {
  return (
    <Suspense fallback={<Working />}>
      <AfterSignIn />
    </Suspense>
  );
}

function AfterSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe({ enabled: isLoaded && isSignedIn });
  const redirectUrl = params.get("redirect_url");
  const signUp = params.get("intent") === "sign-up";

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace(SIGN_IN_PATH);
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (me.data) router.replace(resolvePostSignInPath(me.data, redirectUrl, { signUp }));
  }, [me.data, redirectUrl, signUp, router]);

  if (me.isError) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorState
          error={me.error}
          onRetry={() => me.refetch()}
          title="We couldn't load your account"
          className="px-0 py-6"
        />
        <Button asChild variant="ghost">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }
  return <Working />;
}

function Working() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground" role="status">
      <Spinner className="size-5" />
      Signing you in…
    </div>
  );
}
