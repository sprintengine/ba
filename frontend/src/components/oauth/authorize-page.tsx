"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useAuthorizeCheck } from "@/lib/api/hooks";
import type { AuthorizeRequest } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/components";
import { authorizeReturnPath, parseAuthorizeQuery } from "@/lib/oauth/authorize-query";
import { ErrorState } from "@/components/common/feedback";
import { Card } from "@/components/ui/card";
import {
  ConsentSkeleton,
  InvalidAuthorizeRequest,
  NoBusinessToConnect,
  ReturningToApp,
} from "./authorize-states";
import { ConsentCard } from "./consent-card";

/**
 * /oauth/authorize — the OAuth authorization endpoint apps (Claude, ChatGPT…) open in the browser.
 * Signed-out users go to sign-in and come back to this exact URL (RequireAuth keeps the query).
 */
export function AuthorizePage() {
  return (
    <RequireAuth fallback={<ConsentSkeleton />}>
      <Suspense fallback={<ConsentSkeleton />}>
        <AuthorizeFromQuery />
      </Suspense>
    </RequireAuth>
  );
}

function AuthorizeFromQuery() {
  const search = useSearchParams();
  const request = useMemo(() => parseAuthorizeQuery(search), [search]);
  const returnPath = authorizeReturnPath(search);
  if (!request.clientId) {
    return <InvalidAuthorizeRequest message="The link is missing the app's details (client_id)." />;
  }
  return <AuthorizeCheck request={request} returnPath={returnPath} />;
}

function AuthorizeCheck({ request, returnPath }: { request: AuthorizeRequest; returnPath: string }) {
  const check = useAuthorizeCheck(request);
  const redirectTo = check.data?.type === "redirect" ? check.data.redirectTo : null;

  useEffect(() => {
    // Protocol errors the app should hear about: the backend built a safe redirect to its registered URI.
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  if (check.isError) {
    if (isApiError(check.error) && check.error.status === 400) {
      return <InvalidAuthorizeRequest message={errorMessage(check.error)} />;
    }
    if (isApiError(check.error) && check.error.code === "POLICY_VIOLATION") {
      return <NoBusinessToConnect message={errorMessage(check.error)} />;
    }
    return (
      <Card className="rounded-2xl">
        <ErrorState
          error={check.error}
          title="We couldn't load this request"
          onRetry={() => check.refetch()}
        />
      </Card>
    );
  }
  if (!check.data) return <ConsentSkeleton />;
  if (check.data.type === "redirect") return <ReturningToApp />;
  return <ConsentCard consent={check.data} request={request} returnPath={returnPath} />;
}
