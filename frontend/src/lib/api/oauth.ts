import { api } from "./client";
import { seg } from "./paths";
import type { AuthorizeCheck, AuthorizeDecision, AuthorizeRequest, ConnectedApp, RedirectTo } from "./types";

/** The OAuth consent page and connected apps (§20). Signed-in user. */
export const oauthApi = {
  /** Validates an authorization request: show the consent screen, or send the browser back with an error. */
  check: (request: AuthorizeRequest): Promise<AuthorizeCheck> =>
    api.get<AuthorizeCheck>("/v1/oauth/authorize", {
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      response_type: request.responseType,
      code_challenge: request.codeChallenge,
      code_challenge_method: request.codeChallengeMethod,
      scope: request.scope,
      state: request.state,
      resource: request.resource,
    }),

  /** Approve or deny; resolves to where the browser goes next (the app's registered redirect). */
  decide: (body: AuthorizeDecision): Promise<RedirectTo> => api.post<RedirectTo>("/v1/oauth/authorize", body),

  connectedApps: (): Promise<ConnectedApp[]> => api.get<ConnectedApp[]>("/v1/me/connected-apps"),

  revoke: (id: string): Promise<void> => api.delete(`/v1/me/connected-apps/${seg(id)}`),
};
