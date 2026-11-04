/**
 * How bots sign in. The seam is `AuthProvider`: a token for each identity, the namespace the simulation invents its
 * identities in, and the headers of an anonymous (guest) request. Two providers (`--auth`, docs/simulation.md):
 *
 * - `dev` (default): the development backend's dev tokens (`dev.` + base64url JSON {sub, email, name}), accepted only
 *   with APP_ENV=development and AUTH_MODE=dev.
 * - `simulation-token` (staging): `SimulationTokenAuthProvider`, which mints the backend's staging-only simulation
 *   tokens locally from `SIMULATION_AUTH_SECRET`. The backend accepts them only with the same secret configured, which
 *   production refuses, and only for identities in the reserved namespace (subjects `sim_…`, emails
 *   `…@sim.bookanything.test`), so they can't sign in as a real user. Guest requests carry an `X-Simulation-Token`
 *   header signed with the same secret, which puts them in the simulation's rate-limit bucket.
 *
 * Every identity the simulation invents exists as soon as it calls the API.
 */
import { createHmac, randomUUID } from "node:crypto";
import { encodeDevToken } from "@shared/auth/dev-token";

export type SimIdentity = { sub: string; email: string; name: string };

/** Where the simulation's identities live: their subjects' prefix and their emails' domain. */
export type IdentityNamespace = {
  subjectPrefix: string;
  emailDomain(role: string): string;
};

export type AuthMode = "dev" | "simulation-token";

export interface AuthProvider {
  readonly mode: AuthMode;
  readonly namespace: IdentityNamespace;
  tokenFor(identity: SimIdentity): string;
  /** Headers for a request made without a token (a guest). */
  guestHeaders(): Record<string, string>;
}

/** The development backend's namespace, as the simulation has always used it. */
export const DEV_NAMESPACE: IdentityNamespace = {
  subjectPrefix: "dev_sim_",
  emailDomain: (role) => (role === "customer" ? "example.test" : "bookanything.test"),
};

export class DevAuth implements AuthProvider {
  readonly mode = "dev";
  readonly namespace = DEV_NAMESPACE;
  tokenFor(identity: SimIdentity): string {
    return encodeDevToken(identity);
  }
  guestHeaders(): Record<string, string> {
    return {};
  }
}

/** The backend's reserved namespace for simulation tokens (`SimulationIdentity` in the backend). */
export const SIMULATION_NAMESPACE: IdentityNamespace = {
  subjectPrefix: "sim_",
  emailDomain: () => "sim.bookanything.test",
};

const SUBJECT = /^sim_[A-Za-z0-9_-]{1,100}$/;
const EMAIL = /^[a-z0-9][a-z0-9._+-]{0,63}@sim\.bookanything\.test$/;

/** The longest a token may live (the backend refuses longer ones) and the shortest secret it accepts. */
export const MAX_LIFETIME_SECONDS = 900;
export const MIN_SECRET_BYTES = 32;
export const GUEST_HEADER = "X-Simulation-Token";
const CONTEXT = "bookanything-simulation/v1\n";

type Clock = () => number;

/**
 * Mints the backend's simulation tokens: `<kind>.<base64url(JSON)>.<base64url(HMAC-SHA256)>`, the MAC over
 * `bookanything-simulation/v1\n<kind>.<payload>`; `sim` for a bearer token ({sub, email, name, iat, exp, jti}), `simg`
 * for the guest header ({iat, exp, jti}). Each token lives [lifetimeSeconds] (10 minutes by default, at most 15); one
 * is reused until half its life has gone, so an action that starts with it has minutes left.
 */
export class SimulationTokenAuthProvider implements AuthProvider {
  readonly mode = "simulation-token";
  readonly namespace = SIMULATION_NAMESPACE;
  private readonly key: Buffer;
  private readonly cache = new Map<string, { token: string; iat: number }>();

  constructor(
    secret: string,
    private readonly options: { lifetimeSeconds?: number; now?: Clock; nonce?: () => string } = {},
  ) {
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES)
      throw new Error(`SIMULATION_AUTH_SECRET must be at least ${MIN_SECRET_BYTES} bytes`);
    const lifetime = options.lifetimeSeconds ?? 600;
    if (!Number.isInteger(lifetime) || lifetime < 60 || lifetime > MAX_LIFETIME_SECONDS)
      throw new Error(`a simulation token lives 60 to ${MAX_LIFETIME_SECONDS} seconds`);
    this.key = Buffer.from(secret, "utf8");
  }

  private get lifetime(): number {
    return this.options.lifetimeSeconds ?? 600;
  }

  private now(): number {
    return Math.floor((this.options.now ?? Date.now)() / 1000);
  }

  tokenFor(identity: SimIdentity): string {
    if (!SUBJECT.test(identity.sub) || !EMAIL.test(identity.email.toLowerCase()))
      throw new Error(
        `${identity.sub} <${identity.email}> is not a simulation identity (sim_…@sim.bookanything.test)`,
      );
    return this.cached(`sim:${identity.sub}`, () => ({
      sub: identity.sub,
      email: identity.email,
      ...(identity.name ? { name: identity.name } : {}),
    }));
  }

  guestHeaders(): Record<string, string> {
    return { [GUEST_HEADER]: this.cached("simg", () => ({})) };
  }

  private cached(key: string, claims: () => Record<string, string>): string {
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit && now - hit.iat < this.lifetime / 2) return hit.token;
    const kind = key === "simg" ? "simg" : "sim";
    const token = signSimulationToken(this.key, kind, {
      ...claims(),
      iat: now,
      exp: now + this.lifetime,
      jti: (this.options.nonce ?? randomUUID)(),
    });
    this.cache.set(key, { token, iat: now });
    return token;
  }
}

/** Signs [claims] as a [kind] token with [key] (exported for the tests, which check the format against the backend's). */
export function signSimulationToken(
  key: Buffer,
  kind: "sim" | "simg",
  claims: Record<string, unknown>,
): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const mac = createHmac("sha256", key).update(`${CONTEXT}${kind}.${payload}`, "utf8").digest("base64url");
  return `${kind}.${payload}.${mac}`;
}

/**
 * The provider `--auth` asks for. `simulation-token` reads the secret from SIMULATION_AUTH_SECRET only (never a flag,
 * so it stays out of process lists and shell history).
 */
export function authFor(mode: AuthMode, env: NodeJS.ProcessEnv = process.env): AuthProvider {
  if (mode === "dev") return new DevAuth();
  const secret = env.SIMULATION_AUTH_SECRET?.trim();
  if (!secret)
    throw new Error(
      "--auth simulation-token needs SIMULATION_AUTH_SECRET (the staging backend's, docs/simulation.md)",
    );
  return new SimulationTokenAuthProvider(secret);
}
