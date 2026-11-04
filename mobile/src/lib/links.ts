/** Leaving the app: phone, email, maps, and website pages (in an in-app browser sheet, or the system browser). */
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { env } from "~/config/env";
import { logError } from "./logger";

export function callNumber(phone: string) {
  return Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch((e: unknown) =>
    logError(e, { link: "tel" }),
  );
}

export function sendEmail(email: string) {
  return Linking.openURL(`mailto:${email}`).catch((e: unknown) => logError(e, { link: "mailto" }));
}

/** Directions to an address in Apple Maps (iOS) or the default maps app (Android). */
export function openMaps(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === "ios" ? `https://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
  return Linking.openURL(url).catch((e: unknown) => logError(e, { link: "maps" }));
}

/** A page of the website (`/legal/privacy`), for what the app deliberately leaves to the website. */
export function websiteUrl(path: string): string {
  return `${env.webUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Opens a website page in an in-app browser sheet (keeps the person in the app; shares Safari's sign-in). */
export function openWebsite(path: string) {
  return WebBrowser.openBrowserAsync(websiteUrl(path)).catch((e: unknown) => logError(e, { link: "web" }));
}

/**
 * Opens a website page in the system browser (Safari, Chrome), outside the app: for website areas the app must not
 * show inside it (the dashboard reaches Billing, where a plan is bought: App Store 3.1.1). Through the website's
 * sign-in, which goes straight on to [path] when the browser is signed in already (the browser has its own session);
 * and `/sign-in` isn't one of the paths the app claims as universal links, so the link isn't handed back to the app.
 */
export function openWebsiteInBrowser(path: string) {
  const url = websiteUrl(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
  return Linking.openURL(url).catch((e: unknown) => logError(e, { link: "browser" }));
}
