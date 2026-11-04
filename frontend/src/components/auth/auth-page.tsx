"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignIn, SignUp } from "@clerk/nextjs";
import { CLERK_ENABLED, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth/config";
import { afterSignInUrl, safeRedirectPath } from "@/lib/auth/components";
import { Skeleton } from "@/components/ui/skeleton";
import { DevSignInForm } from "./dev-sign-in-form";

/** /sign-in and /sign-up: Clerk components when configured, dev form otherwise. */
export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AuthPageInner mode={mode} />
    </Suspense>
  );
}

function AuthPageInner({ mode }: { mode: "sign-in" | "sign-up" }) {
  const params = useSearchParams();
  // Without a redirect, new sign-ups go to onboarding; one that turns out to be an existing member's account (Clerk
  // signs them in) goes to their dashboard instead (the /sign-in/done router decides).
  const redirect = safeRedirectPath(params.get("redirect_url"));
  const after = afterSignInUrl(redirect, { signUp: mode === "sign-up" });

  if (!CLERK_ENABLED) return <DevSignInForm mode={mode} redirectUrl={redirect} />;
  return mode === "sign-in" ? (
    <SignIn routing="path" path={SIGN_IN_PATH} signUpUrl={SIGN_UP_PATH} forceRedirectUrl={after} />
  ) : (
    <SignUp routing="path" path={SIGN_UP_PATH} signInUrl={SIGN_IN_PATH} forceRedirectUrl={after} />
  );
}
