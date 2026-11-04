export type AuthUser = {
  /** Clerk user id, or the dev `sub` ("dev_owner"). Not our database user id — use `useMe()` for that. */
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
};

export type AuthState = {
  /** False until the session is known (always false during SSR). Render skeletons until then. */
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  /** Bearer token for the API. The API client already calls this — you rarely need it. */
  getToken: () => Promise<string | null>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  mode: "clerk" | "dev";
};
