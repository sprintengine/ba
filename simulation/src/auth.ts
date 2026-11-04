/**
 * How bots sign in. The seam is `AuthProvider.tokenFor(identity)`; today there is one provider, the development
 * backend's dev tokens (`dev.` + base64url JSON {sub, email, name}), accepted only with APP_ENV=development and
 * AUTH_MODE=dev. Every identity the simulation invents exists as soon as it calls the API.
 *
 * Staging needs a second provider, minting staging-only simulation tokens the backend would accept there; the backend
 * has no such sign-in yet. docs/simulation.md ("On staging") lists what it needs.
 */
import { encodeDevToken } from "@shared/auth/dev-token";

export type SimIdentity = { sub: string; email: string; name: string };

export interface AuthProvider {
  tokenFor(identity: SimIdentity): string;
}

export class DevAuth implements AuthProvider {
  tokenFor(identity: SimIdentity): string {
    return encodeDevToken(identity);
  }
}
