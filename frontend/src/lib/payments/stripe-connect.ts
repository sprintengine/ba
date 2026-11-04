/**
 * Stripe Connect: the two ways a business gets a Stripe account, what Stripe's return to the payments page carries, and
 * how connecting ended, in words. Shared by the website and the app (architecture §7).
 */
import type { ConnectExistingOutcome } from "@/lib/api/types";

/** The two ways to connect, in the words the owner sees. */
export const CONNECT_PATHS = {
  existing: {
    title: "I already have a Stripe account",
    text: "Sign in to Stripe and choose the account to use. Its payouts, branding and dashboard stay as they are.",
  },
  create: {
    title: "Create one for me",
    text: "Set up a new Stripe account in about five minutes. You'll need your bank details and ID.",
  },
} as const;

/** What disconnecting means, for the confirmation (an account connected with OAuth, or one we created). */
export function disconnectWarning(businessName: string, oauth: boolean): string {
  return (
    `${businessName} will stop taking online payments, and services that need payment will be hidden from your ` +
    "booking page. " +
    (oauth
      ? "Our access to your Stripe account ends; the account itself is unchanged."
      : "The Stripe account stays yours, with its own dashboard, and refunds of its payments keep working.")
  );
}

export type ConnectMessage = { tone: "success" | "error"; message: string };

/** The outcomes our callback can put in the address (`?stripe=connect_error&reason=`); the rest come from the API. */
const RELAYED = [
  "denied",
  "expired",
  "invalid",
  "failed",
] as const satisfies readonly ConnectExistingOutcome[];

/** What Stripe's return to the payments page carries (`?stripe=…`). */
export type ConnectReturn =
  | { kind: "complete"; code: string; state: string }
  | { kind: "outcome"; outcome: ConnectExistingOutcome; currency: string | null };

/**
 * Stripe's return to the payments page: `stripe=complete&code=&state=` (finish connecting, signed in) or
 * `stripe=connect_error&reason=` (it stopped at Stripe or at our callback). Null for anything else, including the
 * onboarding returns `stripe=return|refresh`, which the status shows by itself.
 */
export function connectReturn(params: URLSearchParams): ConnectReturn | null {
  const stripe = params.get("stripe");
  const code = params.get("code");
  const state = params.get("state");
  if (stripe === "complete" && code && state) return { kind: "complete", code, state };
  if (stripe !== "connect_error") return null;
  // Only the reasons our callback sends: anything else in the address is not believed.
  const reason = params.get("reason");
  const outcome = RELAYED.find((r) => r === reason) ?? "failed";
  return { kind: "outcome", outcome, currency: null };
}

/** How connecting an existing account ended, in words. */
export function connectMessage(
  outcome: ConnectExistingOutcome,
  currency?: string | null,
  businessCurrency?: string,
): ConnectMessage {
  const error = (message: string): ConnectMessage => ({ tone: "error", message });
  switch (outcome) {
    case "connected":
      return { tone: "success", message: "Your Stripe account is connected." };
    case "denied":
      return error("Stripe wasn't connected: the connection was declined on Stripe's page.");
    case "expired":
      return error("That Stripe link expired or was already used. Try connecting again.");
    case "invalid":
      return error(
        "That Stripe link wasn't started by you for this business. Start connecting again from here.",
      );
    case "forbidden":
      return error("Only an owner can connect a Stripe account.");
    case "already_connected":
      return error("This business already has a Stripe account. Disconnect it first to use another.");
    case "account_in_use":
      return error(
        "That Stripe account already takes payments for another business here. Each business needs its own Stripe account.",
      );
    case "currency": {
      const theirs = currency && /^[A-Z]{3}$/.test(currency) ? currency : "another currency";
      const ours = businessCurrency ? ` but this business charges in ${businessCurrency}` : "";
      return error(
        `That Stripe account pays out in ${theirs}${ours}. Connect an account in the same currency, or create one.`,
      );
    }
    default:
      return error("Stripe couldn't connect the account. Please try again.");
  }
}
