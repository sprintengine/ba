/** Clerk is used when its publishable key is configured; otherwise dev auth (architecture §3.2). */
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
export const CLERK_ENABLED = CLERK_PUBLISHABLE_KEY.length > 0;
export const AUTH_MODE: "clerk" | "dev" = CLERK_ENABLED ? "clerk" : "dev";

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
/** Post-auth router: calls /v1/me, then sends members to the dashboard, customers to My bookings, others to onboarding. */
export const AFTER_SIGN_IN_PATH = "/sign-in/done";
