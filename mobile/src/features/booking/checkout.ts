/**
 * Paying a held booking: Stripe Checkout is a Stripe-hosted page (docs/mobile.md "What stays on the website"), opened
 * in an authentication session over the app. Stripe returns to the booking's manage page on the website
 * (`/manage/{token}?payment=succeeded|cancelled`, architecture §7); with the app's associated domains that https
 * address closes the session and tells us how it ended. Elsewhere (no token, a development http website, an old iOS)
 * the page opens in the in-app browser and the outcome is unknown until the booking is read again.
 */
import * as WebBrowser from "expo-web-browser";
import { websiteUrl } from "~/lib/links";
import { logError } from "~/lib/logger";

export type CheckoutOutcome = "succeeded" | "cancelled" | "unknown";

/** The outcome in a manage-page address Stripe sent the person back to. */
export function outcomeFromUrl(url: string | null | undefined): CheckoutOutcome {
  const match = /[?&]payment=(succeeded|cancelled)\b/.exec(url ?? "");
  return (match?.[1] as CheckoutOutcome | undefined) ?? "unknown";
}

/** Opens Checkout and resolves when the person is back in the app. */
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
      return result?.type === "success" ? outcomeFromUrl(result.url) : "unknown";
    }
    await WebBrowser.openBrowserAsync(checkoutUrl, { dismissButtonStyle: "done" });
    return "unknown";
  } catch (error) {
    logError(error, { link: "checkout" });
    throw error;
  }
}
