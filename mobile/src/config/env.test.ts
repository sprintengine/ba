import { configProblem, devHostFrom, resolveEnv } from "./env";

describe("resolveEnv", () => {
  it("points a development build at the Mac that serves the bundle", () => {
    const e = resolveEnv({ variant: "development" }, "192.0.2.10:8081");
    expect(e).toMatchObject({
      apiUrl: "http://192.0.2.10:8080",
      webUrl: "http://192.0.2.10:3000",
      authMode: "dev",
      clerkPublishableKey: null,
    });
    expect(resolveEnv({}, null, "8090").apiUrl).toBe("http://localhost:8090");
  });

  it("uses the configured origins and Clerk when given, without trailing slashes", () => {
    const e = resolveEnv(
      {
        variant: "production",
        apiUrl: "https://api.bookanything.ie/",
        webUrl: "https://bookanything.ie",
        clerkPublishableKey: "pk_live_x",
      },
      "10.0.0.1:8081",
    );
    expect(e).toEqual({
      variant: "production",
      apiUrl: "https://api.bookanything.ie",
      webUrl: "https://bookanything.ie",
      authMode: "clerk",
      clerkPublishableKey: "pk_live_x",
      sentryDsn: null,
      sentryEnvironment: "production",
    });
    expect(configProblem(e)).toBeNull();
  });

  it("flags store builds without an API or sign-in", () => {
    expect(configProblem(resolveEnv({ variant: "preview" }, null))).toMatch(/API/);
    expect(configProblem(resolveEnv({ variant: "preview", apiUrl: "https://x" }, null))).toMatch(/sign-in/);
    expect(configProblem(resolveEnv({}, null))).toBeNull();
  });

  it("reports to Sentry only with a DSN, under the variant's environment unless overridden", () => {
    expect(resolveEnv({}, null)).toMatchObject({ sentryDsn: null, sentryEnvironment: "development" });
    expect(resolveEnv({ variant: "preview", sentryDsn: "https://key@sentry.example/1" }, null)).toMatchObject(
      { sentryDsn: "https://key@sentry.example/1", sentryEnvironment: "staging" },
    );
    expect(resolveEnv({ variant: "preview", sentryEnvironment: "qa" }, null).sentryEnvironment).toBe("qa");
  });

  it("reads the host out of a Metro host URI", () => {
    expect(devHostFrom("my-mac.local:8081")).toBe("my-mac.local");
    expect(devHostFrom(undefined)).toBe("localhost");
  });
});
