/**
 * A request's result links (architecture §20.9): app paths, or full URLs: the website's own pages (Your bookings) or
 * a payment page (Pay now, Stripe Checkout). Pages the app has open in the app; payment opens Checkout.
 */
import { router, type Href } from "expo-router";
import { env } from "~/config/env";
import { openCheckout } from "~/features/booking/checkout";

/** Website paths the app has its own screens for (as app.config.ts claims for universal links). */
const APP_PATHS = ["/my", "/manage", "/dashboard", "/explore", "/invitations"];

export type LinkTarget = { kind: "app"; href: string } | { kind: "payment"; url: string };

/** Where a result link goes: an app screen (for our paths and website pages the app has), else a payment page. */
export function linkTarget(path: string, webUrl: string = env.webUrl): LinkTarget {
  if (path.startsWith("/")) return { kind: "app", href: path };
  try {
    const url = new URL(path);
    const site = webUrl ? new URL(webUrl) : null;
    if (
      site &&
      url.host === site.host &&
      APP_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))
    ) {
      return { kind: "app", href: `${url.pathname}${url.search}` };
    }
  } catch {
    // Not a URL: treat as a page to open.
  }
  return { kind: "payment", url: path };
}

/** Follows a result link; resolves once the person is back (after paying, the caller refreshes). */
export async function followLink(path: string): Promise<"navigated" | "paid"> {
  const target = linkTarget(path);
  if (target.kind === "app") {
    router.push(target.href as Href);
    return "navigated";
  }
  await openCheckout(target.url, null);
  return "paid";
}
