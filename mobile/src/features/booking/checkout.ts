/**
 * Paying a held booking: Stripe Checkout is a Stripe-hosted page (docs/mobile.md "What stays on the website"), opened
 * in an authentication session over the app. Stripe returns to the booking's manage page on the website
 * (`/manage/{token}?payment=succeeded|cancelled`, architecture §7); with the app's associated domains that https
 * address closes the session and tells us how it ended. Elsewhere (no token, a development http website, an old iOS)
 * the page opens in the in-app browser and the outcome is unknown until the booking is read again.
 */
import * as WebBrowser from "expo-web-browser";
import { publicApi } from "@shared/api/public";
import { websiteUrl } from "~/lib/links";
import { logError } from "~/lib/logger";

export type CheckoutOutcome = "succeeded" | "cancelled" | "unknown";

/** How long the app waits for a payment to be confirmed on return before it moves on (the view keeps reading). */
const CONFIRM_WAIT_MS = 5_000;

/** The outcome in a manage-page address Stripe sent the person back to. */
export function outcomeFromUrl(url: string | null | undefined): CheckoutOutcome {
  const match = /[?&]payment=(succeeded|cancelled)\b/.exec(url ?? "");
  return (match?.[1] as CheckoutOutcome | undefined) ?? "unknown";
}

/** The Checkout Session in an address Stripe sent the person back to (`session_id`, which Stripe fills in). */
export function sessionFromUrl(url: string | null | undefined): string | null {
  return /[?&]session_id=(cs_[A-Za-z0-9_]+)/.exec(url ?? "")?.[1] ?? null;
}

/**
 * Opens Checkout and resolves when the person is back in the app. A payment that succeeded is confirmed straight away
 * (the server reads it from Stripe instead of waiting for Stripe's webhook); the booking read next shows it.
 */
export async function openCheckout(
  checkoutUrl: string,
  manageToken?: string | null,
): Promise<CheckoutOutcome> {
  try {
    const returnUrl = manageToken ? websiteUrl(`/manage/${encodeURIComponent(manageToken)}`) : null;
    if (returnUrl?.startsWith("https://")) {
      const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl, {
        preferUniversalLinks: true,
        // No "wants to use … to sign in" prompt, and nothing of the person's browsing shared with Stripe.
        preferEphemeralSession: true,
      });
      if (result?.type !== "success") return "unknown";
      const outcome = outcomeFromUrl(result.url);
      const session = sessionFromUrl(result.url);
      if (outcome === "succeeded" && session && manageToken) {
        // Best effort, a few seconds at most: the webhook confirms it anyway, and the view keeps reading the booking.
        await Promise.race([
          publicApi.confirmManagedPayment(manageToken, { sessionId: session }).catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, CONFIRM_WAIT_MS)),
        ]);
      }
      return outcome;
    }
    await WebBrowser.openBrowserAsync(checkoutUrl, { dismissButtonStyle: "done" });
    return "unknown";
  } catch (error) {
    logError(error, { link: "checkout" });
    throw error;
  }
}
