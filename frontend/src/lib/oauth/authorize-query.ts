import * as z from "zod";
import type { AuthorizeRequest } from "@/lib/api/types";

/** The consent page route (the OAuth authorization endpoint that apps open in the browser). */
export const AUTHORIZE_PATH = "/oauth/authorize";

/** One query parameter: first value wins, empty or missing becomes `null`. Validation is the backend's job. */
const param = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((value): string | null => {
    const first = Array.isArray(value) ? value[0] : value;
    return first ? first : null;
  });

export const authorizeQuerySchema = z
  .object({
    response_type: param,
    client_id: param,
    redirect_uri: param,
    code_challenge: param,
    code_challenge_method: param,
    scope: param,
    state: param,
    resource: param,
  })
  .transform((q): AuthorizeRequest => ({
    clientId: q.client_id,
    redirectUri: q.redirect_uri,
    responseType: q.response_type,
    codeChallenge: q.code_challenge,
    codeChallengeMethod: q.code_challenge_method,
    scope: q.scope,
    state: q.state,
    resource: q.resource,
  }));

type QueryInput = URLSearchParams | string | Record<string, string | string[] | undefined>;

function toRecord(input: QueryInput): Record<string, string | string[] | undefined> {
  if (typeof input !== "string" && !(input instanceof URLSearchParams)) return input;
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const record: Record<string, string> = {};
  // Keep the first occurrence of each key (URLSearchParams.get semantics).
  for (const [key, value] of params) if (!(key in record)) record[key] = value;
  return record;
}

/** Maps the snake_case authorization query (`?client_id=…&redirect_uri=…`) to an `AuthorizeRequest`. */
export function parseAuthorizeQuery(input: QueryInput): AuthorizeRequest {
  return authorizeQuerySchema.parse(toRecord(input));
}

/** The exact consent URL (path + original query) to come back to after signing in. */
export function authorizeReturnPath(search: URLSearchParams | string): string {
  const qs = (typeof search === "string" ? search : search.toString()).replace(/^\?/, "");
  return qs ? `${AUTHORIZE_PATH}?${qs}` : AUTHORIZE_PATH;
}
