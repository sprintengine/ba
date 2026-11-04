/**
 * Where a notification goes (pure). A notification's `link` is a website path (architecture §22): the app's routes
 * mirror the website's, so most open the same screen in the app; the few the app shows differently are mapped here.
 * Anything else stays on the website.
 */

/** Website paths the app has screens for (app.config.ts APP_LINK_PATHS). */
const APP_PREFIXES = ["/my", "/dashboard", "/manage", "/invitations", "/explore"];

export type NotificationTarget = { kind: "app"; href: string } | { kind: "web"; path: string };

/**
 * The app route for a notification link, or the website path to open. Only same-site paths are followed: a full URL or
 * a protocol-relative one (`//evil.example`) is refused (null), whatever a payload says.
 */
export function notificationTarget(link: string | null | undefined): NotificationTarget | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(link, "https://app.invalid");
  } catch {
    return null;
  }
  if (url.host !== "app.invalid") return null;
  const path = url.pathname;
  // The website opens a booking in a drawer over the list (`?booking=`); the app has its own screen for it.
  const bookings = /^\/dashboard\/([^/]+)\/bookings\/?$/.exec(path);
  const booking = url.searchParams.get("booking");
  if (bookings && booking) {
    return { kind: "app", href: `/dashboard/${bookings[1]}/bookings/${encodeURIComponent(booking)}` };
  }
  const inApp = APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const full = `${path}${url.search}`;
  return inApp ? { kind: "app", href: full } : { kind: "web", path: full };
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "2 days ago", else the date (the website's bell). */
export function timeAgo(iso: string, now: number = Date.now(), locale?: string): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}
