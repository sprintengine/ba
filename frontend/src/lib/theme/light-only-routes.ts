/**
 * The public website is light only: a visitor's dark mode applies to the app, not to these. Each is a folder in
 * app/(marketing); a test there checks none is missed. A plain function of the path, so it needs no browser.
 */
const LIGHT_ONLY_SECTIONS = ["/explore", "/for", "/help", "/legal", "/pricing"];

export function isLightOnlyPath(pathname: string): boolean {
  return pathname === "/" || LIGHT_ONLY_SECTIONS.some((s) => pathname === s || pathname.startsWith(`${s}/`));
}
