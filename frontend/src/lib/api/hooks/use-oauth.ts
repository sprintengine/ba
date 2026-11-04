"use client";

import { useQuery } from "@tanstack/react-query";
import { oauthApi } from "../oauth";
import { qk } from "../query-keys";
import type { AuthorizeCheck, AuthorizeDecision, AuthorizeRequest, ConnectedApp, RedirectTo } from "../types";
import {
  enabledWhen,
  invalidateAll,
  removeFromList,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Validates an authorization request for the signed-in user (consent screen). Never retried: errors are final. */
export function useAuthorizeCheck(request: AuthorizeRequest, options?: QueryOptions<AuthorizeCheck>) {
  return useQuery({
    retry: false,
    staleTime: Infinity,
    ...options,
    queryKey: qk.oauthAuthorize(request),
    queryFn: () => oauthApi.check(request),
    enabled: enabledWhen(!!request.clientId, options),
  });
}

/** Approve or deny; resolves to where the browser must go next. */
export function useAuthorizeDecision(options?: MutationOptions<RedirectTo, AuthorizeDecision>) {
  return useApiMutation(
    (decision: AuthorizeDecision) => oauthApi.decide(decision),
    (qc) => invalidateAll(qc, [qk.connectedApps()]),
    options,
  );
}

export function useConnectedApps(options?: QueryOptions<ConnectedApp[]>) {
  return useQuery({ ...options, queryKey: qk.connectedApps(), queryFn: () => oauthApi.connectedApps() });
}

/** Variables: the connected app (grant) id. Ends every token the app holds. */
export function useRevokeConnectedApp(options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => oauthApi.revoke(id),
    (qc, _data, id) => {
      removeFromList(qc, qk.connectedApps(), id);
      return invalidateAll(qc, [qk.connectedApps()]);
    },
    options,
  );
}
