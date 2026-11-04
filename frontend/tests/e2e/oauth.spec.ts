import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { CUSTOMER, requireLiveBackend, signInAs } from "./dashboard-helpers";

/**
 * An MCP client connecting to the customer MCP (architecture §20): it registers, sends the browser to our consent page,
 * receives the code on its loopback redirect, exchanges it with PKCE and calls the MCP server; then the customer
 * disconnects it under Connected apps.
 */
const REDIRECT = "http://127.0.0.1:43219/callback";

function pkce() {
  const verifier = randomBytes(40).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

test("an assistant is approved on the consent page, uses the MCP server and is disconnected", async ({
  page,
  baseURL,
}, testInfo) => {
  await requireLiveBackend(page, testInfo);
  const origin = baseURL!;
  const name = `E2E Assistant ${testInfo.project.name} ${Date.now()}`;

  const registered = await page.request.post("/api/v1/oauth/register", {
    data: { client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" },
  });
  expect(registered.status()).toBe(201);
  const clientId = (await registered.json()).client_id as string;

  // Discovery as an MCP client does it: 401 → protected resource metadata → authorization server metadata.
  const unauthenticated = await page.request.post("/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["www-authenticate"]).toContain(
    `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
  );
  const prm = await (await page.request.get("/.well-known/oauth-protected-resource/mcp")).json();
  expect(prm.resource).toBe(`${origin}/mcp`);
  const as = await (await page.request.get("/.well-known/oauth-authorization-server")).json();
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);

  // The client's redirect target: capture the code instead of needing a real listener.
  let callback: URL | null = null;
  await page.route(`${REDIRECT}**`, async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Connected</h1>" });
  });

  await signInAs(page, CUSTOMER);
  const { verifier, challenge } = pkce();
  const authorize = new URL("/oauth/authorize", origin);
  Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "bookings:read bookings:write marketplace:read",
    state: "e2e-state",
    resource: `${origin}/mcp`,
  }).forEach(([k, v]) => authorize.searchParams.set(k, v));
  await page.goto(authorize.toString());

  await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/127\.0\.0\.1/).first()).toBeVisible();
  await expect(page.getByText(/See your bookings/)).toBeVisible();
  await page.getByRole("button", { name: /^Allow/ }).click();
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible({ timeout: 15_000 });

  const cb = callback as URL | null;
  expect(cb?.searchParams.get("state")).toBe("e2e-state");
  expect(cb?.searchParams.get("iss")).toBe(origin);
  const code = cb!.searchParams.get("code")!;

  const tokenRes = await page.request.post("/api/v1/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: `${origin}/mcp`,
    },
  });
  expect(tokenRes.status()).toBe(200);
  const accessToken = (await tokenRes.json()).access_token as string;

  const mcp = (method: string, params: object = {}) =>
    page.request.post("/mcp", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
  const tools = await (await mcp("tools/list")).json();
  expect(tools.result.tools.map((t: { name: string }) => t.name)).toContain("book");
  const next = await (
    await mcp("tools/call", { name: "list_my_bookings", arguments: { status: "all", limit: 5 } })
  ).json();
  expect(next.result.isError ?? false).toBe(false);

  // Connected apps: the assistant is listed, then disconnected; its token stops working.
  await page.goto("/my/connected-apps");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: /Disconnect/ }).click();
  const revoked = page.waitForResponse(
    (r) => r.url().includes("/connected-apps/") && r.request().method() === "DELETE",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Disconnect/ })
    .click();
  expect((await revoked).status()).toBe(204);
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 });
  expect((await mcp("tools/list")).status()).toBe(401);
});

test("an unregistered redirect is refused on the consent page without redirecting", async ({
  page,
  baseURL,
}, testInfo) => {
  await requireLiveBackend(page, testInfo);
  const registered = await page.request.post("/api/v1/oauth/register", {
    data: { client_name: "Refused", redirect_uris: [REDIRECT] },
  });
  const clientId = (await registered.json()).client_id as string;
  await signInAs(page, CUSTOMER);
  const url = new URL("/oauth/authorize", baseURL);
  Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://evil.example/callback",
    code_challenge: pkce().challenge,
    code_challenge_method: "S256",
    state: "x",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  await page.goto(url.toString());
  await expect(page.getByText(/didn't register/i)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/oauth\/authorize/);
  await expect(page.getByRole("button", { name: /^Allow/ })).toHaveCount(0);
});
