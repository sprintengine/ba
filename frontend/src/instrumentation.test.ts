import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN as DSN } from "@/test/sentry";

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn() }));
vi.mock("@sentry/nextjs", () => sdk);

async function load(dsn = "") {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
  vi.resetModules();
  return import("./instrumentation");
}

type RequestErrorArgs = Parameters<Awaited<ReturnType<typeof load>>["onRequestError"]>;
const requestError: RequestErrorArgs = [
  new Error("boom"),
  { path: "/manage/s3cr3t", method: "GET", headers: {} },
  {
    routerKind: "App Router",
    routePath: "/manage/[token]",
    routeType: "render",
    renderSource: "react-server-components",
    revalidateReason: undefined,
  },
];

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("instrumentation", () => {
  it("loads no SDK and reports nothing without a DSN", async () => {
    const { register, onRequestError } = await load();
    await register();
    await onRequestError(...requestError);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureRequestError).not.toHaveBeenCalled();
  });

  it("starts the server SDK with the shared options and reports request errors", async () => {
    const { register, onRequestError } = await load(DSN);
    await register();
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN, dataCollection: expect.objectContaining({ userInfo: false }) }),
    );
    await onRequestError(...requestError);
    expect(sdk.captureRequestError).toHaveBeenCalledWith(...requestError);
  });
});
