import { Redirect } from "expo-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "@shared/auth/context";
import { signInHref, useCurrentPath } from "./return-to";

/**
 * Screens that need an account but are opened from links (the website hands `/my/…`, `/dashboard/…` and
 * `/invitations/…` to the app). Opened signed out, they send the person to sign-in and come back afterwards
 * (`returnTo`). Signing out (or deleting the account) on one goes to plain sign-in, so whoever signs in next starts
 * at their own home; `returnAfterSignOut` comes back anyway (an invitation's "Use a different account").
 */
export function RequireSignIn({
  children,
  returnAfterSignOut = false,
}: {
  children: ReactNode;
  returnAfterSignOut?: boolean;
}) {
  const { isSignedIn } = useAuth();
  const [openedSignedOut] = useState(!isSignedIn);
  if (isSignedIn) return <>{children}</>;
  return <ToSignIn comeBack={openedSignedOut || returnAfterSignOut} />;
}

/** Reads the current path only when needed (search params change with every navigation). */
function ToSignIn({ comeBack }: { comeBack: boolean }) {
  const path = useCurrentPath();
  return <Redirect href={signInHref(comeBack ? path : null)} />;
}
