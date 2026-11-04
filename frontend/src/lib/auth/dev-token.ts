/**
 * Dev auth tokens (architecture §3.2): `Authorization: Bearer dev.<base64url(JSON)>` where JSON is
 * {"sub":"dev_…","email":"…","name":"…"}. Only accepted by a backend running AUTH_MODE=dev + APP_ENV=development.
 * Pure (no storage), so the mobile app's dev sign-in shares it; the website keeps its token in localStorage
 * (`dev-auth.ts`).
 */

export type DevIdentity = { sub: string; email: string; name: string };

/** Matches the backend demo seed. */
export const DEMO_ACCOUNTS: (DevIdentity & { role: string; description: string })[] = [
  {
    sub: "dev_owner",
    email: "owner@bookanything.test",
    name: "Demo Owner",
    role: "Owner",
    description: "Runs the demo businesses, with full dashboard access.",
  },
  {
    sub: "dev_staff",
    email: "staff@bookanything.test",
    name: "Demo Staff",
    role: "Staff",
    description: "A team member who sees their own calendar.",
  },
  {
    sub: "dev_customer",
    email: "customer@bookanything.test",
    name: "Demo Customer",
    role: "Customer",
    description: "Books appointments and sees My bookings.",
  },
];

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDevToken(identity: DevIdentity): string {
  return `dev.${base64UrlEncode(JSON.stringify({ sub: identity.sub, email: identity.email, name: identity.name }))}`;
}

export function decodeDevToken(token: string): DevIdentity | null {
  if (!token.startsWith("dev.")) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(token.slice(4))) as Partial<DevIdentity>;
    if (typeof parsed.sub !== "string" || typeof parsed.email !== "string") return null;
    return { sub: parsed.sub, email: parsed.email, name: typeof parsed.name === "string" ? parsed.name : "" };
  } catch {
    return null;
  }
}

/** Stable `sub` for an arbitrary email: "Jane.Doe@x.ie" → "dev_jane_doe_x_ie". Demo emails map to their seeded subs. */
export function devSubForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const demo = DEMO_ACCOUNTS.find((a) => a.email === normalized);
  if (demo) return demo.sub;
  return `dev_${normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}
