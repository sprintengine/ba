import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeDevToken } from "@shared/auth/dev-token";
import {
  authFor,
  DevAuth,
  GUEST_HEADER,
  MAX_LIFETIME_SECONDS,
  signSimulationToken,
  SimulationTokenAuthProvider,
} from "../src/auth";
import { identity } from "../src/setup";

const SECRET = "simulation-secret-for-tests-0123456789";
/** 2026-10-05T08:00:00Z, the backend tests' default now. */
const NOW = 1_791_187_200;

/**
 * The same token the backend's SimulationTokensTest verifies (computed independently, outside both code bases): the
 * runner and the backend agree on the format byte for byte.
 */
const VECTOR =
  "sim.eyJzdWIiOiJzaW1fdmVjX293bmVyMSIsImVtYWlsIjoic2ltLXZlYy1vd25lcjFAc2ltLmJvb2thbnl0aGluZy50ZXN0IiwibmFtZSI6Ik93bmVyIDEgdmVjIiwiaWF0IjoxNzkxMTg3MjAwLCJleHAiOjE3OTExODc4MDAsImp0aSI6InZlY3Rvci1ub25jZSJ9.2FC8Psx3U0W2Ak4UeWi7-7yNJo5CigUUybcisIp35pk";
const GUEST_VECTOR =
  "simg.eyJpYXQiOjE3OTExODcyMDAsImV4cCI6MTc5MTE4NzgwMCwianRpIjoidmVjdG9yLW5vbmNlIn0.wD0WEgStoklLS6lmSrihOAfeD2fzbAJOGfbbanKkRKM";

function provider(clock: { now: number }, lifetimeSeconds?: number) {
  return new SimulationTokenAuthProvider(SECRET, {
    now: () => clock.now * 1000,
    nonce: () => "vector-nonce",
    ...(lifetimeSeconds ? { lifetimeSeconds } : {}),
  });
}

function decode(token: string) {
  const [kind, payload, mac] = token.split(".");
  return { kind, claims: JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as object, mac };
}

describe("SimulationTokenAuthProvider", () => {
  it("mints exactly the token the backend verifies", () => {
    const auth = provider({ now: NOW });
    const owner = identity("vec", "owner", 1, auth.namespace);
    expect(owner).toEqual({
      sub: "sim_vec_owner1",
      email: "sim-vec-owner1@sim.bookanything.test",
      name: "Owner 1 vec",
    });
    expect(auth.tokenFor(owner)).toBe(VECTOR);
    expect(auth.guestHeaders()).toEqual({ [GUEST_HEADER]: GUEST_VECTOR });
  });

  it("signs over the kind and payload with the domain-separation prefix", () => {
    const token = signSimulationToken(Buffer.from(SECRET), "sim", { iat: 1, exp: 2 });
    const [kind, payload, mac] = token.split(".");
    const expected = createHmac("sha256", SECRET)
      .update(`bookanything-simulation/v1\n${kind}.${payload}`)
      .digest("base64url");
    expect(mac).toBe(expected);
    expect(token).not.toContain("=");
  });

  it("gives each identity its own token, reused until half its life has gone", () => {
    const clock = { now: NOW };
    const auth = provider(clock);
    const a = identity("t", "customer", 1, auth.namespace);
    const b = identity("t", "customer", 2, auth.namespace);
    const first = auth.tokenFor(a);
    expect(decode(first).claims).toEqual({
      sub: a.sub,
      email: a.email,
      name: a.name,
      iat: NOW,
      exp: NOW + 600,
      jti: "vector-nonce",
    });
    expect(auth.tokenFor(b)).not.toBe(first);
    clock.now += 299;
    expect(auth.tokenFor(a)).toBe(first);
    clock.now += 1;
    const second = auth.tokenFor(a);
    expect(second).not.toBe(first);
    expect(decode(second).claims).toMatchObject({ iat: NOW + 300, exp: NOW + 900 });
    const guest = auth.guestHeaders()[GUEST_HEADER]!;
    expect(decode(guest)).toMatchObject({ kind: "simg", claims: { iat: NOW + 300, exp: NOW + 900 } });
    expect(Object.keys(decode(guest).claims)).not.toContain("sub");
  });

  it("refuses identities outside the reserved namespace and secrets the backend would refuse", () => {
    const auth = provider({ now: NOW });
    expect(() => auth.tokenFor(identity("t", "owner", 1))).toThrow(/not a simulation identity/);
    expect(() =>
      auth.tokenFor({ sub: "sim_ok", email: "someone@bookanything.ie", name: "Real Person" }),
    ).toThrow(/not a simulation identity/);
    expect(() => auth.tokenFor({ sub: "user_2abc", email: "a@sim.bookanything.test", name: "x" })).toThrow();
    expect(() => new SimulationTokenAuthProvider("x".repeat(31))).toThrow(/at least 32 bytes/);
    expect(
      () => new SimulationTokenAuthProvider(SECRET, { lifetimeSeconds: MAX_LIFETIME_SECONDS + 1 }),
    ).toThrow();
    expect(() => new SimulationTokenAuthProvider(SECRET, { lifetimeSeconds: 30 })).toThrow();
    expect(
      decode(provider({ now: NOW }, 900).tokenFor(identity("t", "owner", 1, auth.namespace))).claims,
    ).toMatchObject({
      exp: NOW + 900,
    });
  });

  it("leaves the name out when there is none", () => {
    const auth = provider({ now: NOW });
    const claims = decode(auth.tokenFor({ sub: "sim_x", email: "x@sim.bookanything.test", name: "" })).claims;
    expect(Object.keys(claims)).not.toContain("name");
  });
});

describe("authFor", () => {
  it("picks dev tokens by default and simulation tokens with the secret from the environment", () => {
    const dev = authFor("dev", {});
    expect(dev).toBeInstanceOf(DevAuth);
    expect(dev.guestHeaders()).toEqual({});
    const id = identity("t", "owner", 1, dev.namespace);
    expect(id.sub).toBe("dev_sim_t_owner1");
    expect(id.email).toBe("sim-t-owner1@bookanything.test");
    expect(identity("t", "customer", 1, dev.namespace).email).toBe("sim-t-customer1@example.test");
    expect(decodeDevToken(dev.tokenFor(id))).toEqual(id);

    const sim = authFor("simulation-token", { SIMULATION_AUTH_SECRET: ` ${SECRET} ` });
    expect(sim.mode).toBe("simulation-token");
    expect(sim.tokenFor(identity("t", "owner", 1, sim.namespace))).toMatch(/^sim\.[\w-]+\.[\w-]+$/);
    expect(() => authFor("simulation-token", {})).toThrow(/SIMULATION_AUTH_SECRET/);
    expect(() => authFor("simulation-token", { SIMULATION_AUTH_SECRET: "   " })).toThrow(
      /SIMULATION_AUTH_SECRET/,
    );
  });
});
