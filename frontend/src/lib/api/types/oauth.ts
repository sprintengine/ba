/** API types: OAuth consent and connected apps (architecture §20). Import them from `@/lib/api/types`. */

export type OAuthScope = { key: string; label: string; description: string };

/** The authorization request parameters, relayed by the consent page. */
export type AuthorizeRequest = {
  clientId: string | null;
  redirectUri: string | null;
  responseType: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string | null;
  state: string | null;
  resource: string | null;
};

export type ConsentClient = {
  clientId: string;
  name: string;
  uri: string | null;
  kind: "dynamic" | "metadata_document";
  redirectUri: string;
  redirectHost: string;
  /** Only redirects to this device: show a warning. */
  localOnly: boolean;
};

/** Which MCP server a connection is for: the user's own bookings (`/mcp`) or the businesses they belong to (`/mcp/business`). */
export type OAuthAudience = "customer" | "business";

/** A business a business-server connection reaches, with the user's role there. */
export type ConsentBusiness = {
  name: string;
  slug: string;
  role: "owner" | "admin" | "staff";
  /** False when its owner doesn't let this member use AI apps there: listed, but the app can't use it until they do. */
  aiAgentsAllowed: boolean;
};

export type AuthorizeCheck =
  | {
      type: "consent";
      client: ConsentClient;
      scopes: OAuthScope[];
      resource: string;
      audience: OAuthAudience;
      user: { email: string | null; name: string | null };
      previouslyApproved: boolean;
      /** Business audience: every business the connection reaches. */
      businesses?: ConsentBusiness[];
    }
  | { type: "redirect"; redirectTo: string };

export type AuthorizeDecision = { request: AuthorizeRequest; approve: boolean };
export type RedirectTo = { redirectTo: string };

export type ConnectedApp = {
  id: string;
  clientId: string;
  name: string;
  clientUri: string | null;
  kind: "dynamic" | "metadata_document";
  redirectHost: string;
  audience: OAuthAudience;
  scopes: OAuthScope[];
  connectedAt: string;
  lastUsedAt: string | null;
};
