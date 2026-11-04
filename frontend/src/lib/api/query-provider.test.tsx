/** The app's QueryClient: retry policy, defaults, and clearing the cache when the signed-in user changes. */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthContext } from "@/lib/auth/context";
import type { AuthState, AuthUser } from "@/lib/auth/types";
import { ApiError } from "./client";
import { PublicQueryProvider, QueryProvider, resetQueryClientForTests } from "./query-provider";

beforeEach(() => resetQueryClientForTests());

const user = (id: string): AuthUser => ({ id, email: `${id}@example.com`, name: null, imageUrl: null });

function auth(isLoaded: boolean, signedIn: AuthUser | null): AuthState {
  return {
    isLoaded,
    isSignedIn: !!signedIn,
    user: signedIn,
    getToken: async () => null,
    signOut: async () => {},
    mode: "dev",
  };
}

/** Renders the provider; `client()` is its QueryClient, `as(state)` re-renders with another auth state. */
function setup(initial: AuthState) {
  let client: QueryClient | null = null;
  function Probe() {
    client = useQueryClient();
    return null;
  }
  const tree = (state: AuthState) => (
    <AuthContext.Provider value={state}>
      <QueryProvider>
        <Probe />
      </QueryProvider>
    </AuthContext.Provider>
  );
  let view = render(tree(initial));
  return {
    client: () => {
      if (!client) throw new Error("QueryProvider rendered no client");
      return client;
    },
    as: (state: AuthState) => view.rerender(tree(state)),
    /** Unmounts and mounts a new provider, as navigating to another route group does. */
    remount: (state: AuthState) => {
      view.unmount();
      client = null;
      view = render(tree(state));
    },
  };
}

describe("QueryProvider defaults", () => {
  const retry = () => {
    const policy = setup(auth(true, null)).client().getDefaultOptions().queries?.retry;
    if (typeof policy !== "function") throw new Error("expected a retry function");
    return (failureCount: number, error: unknown) => policy(failureCount, error as Error);
  };

  it("never retries a client error (4xx)", () => {
    const shouldRetry = retry();
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetry(0, new ApiError(status, "X", "x"))).toBe(false);
    }
  });

  it("retries server errors, network failures and unknown errors twice", () => {
    const shouldRetry = retry();
    for (const error of [
      new ApiError(503, "SERVICE_UNAVAILABLE", "down"),
      new ApiError(0, "NETWORK_ERROR", "offline"),
      new Error("boom"),
    ]) {
      expect([0, 1, 2].map((count) => shouldRetry(count, error))).toEqual([true, true, false]);
    }
  });

  it("keeps data fresh for 30s, refetches on focus and never retries mutations", () => {
    const options = setup(auth(true, null)).client().getDefaultOptions();
    expect(options.queries).toMatchObject({
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
    });
    expect(options.mutations?.retry).toBe(false);
  });
});

describe("QueryProvider user changes", () => {
  it("keeps the cache across re-renders for the same user and while auth is loading", () => {
    const app = setup(auth(false, null));
    app.client().setQueryData(["me"], { user: "a" });

    app.as(auth(true, user("a")));
    app.as(auth(true, user("a")));
    app.as(auth(false, null));

    expect(app.client().getQueryData(["me"])).toEqual({ user: "a" });
  });

  it("clears the cache when another user signs in", () => {
    const app = setup(auth(true, user("a")));
    app.client().setQueryData(["me"], { user: "a" });

    app.as(auth(true, user("b")));

    expect(app.client().getQueryData(["me"])).toBeUndefined();
  });

  it("clears the cache on sign-out", () => {
    const app = setup(auth(true, user("a")));
    app.client().setQueryData(["business", "b1", "detail"], { id: "b1" });

    app.as(auth(true, null));

    expect(app.client().getQueryData(["business", "b1", "detail"])).toBeUndefined();
  });

  it("keeps the same client for the app's lifetime", () => {
    const app = setup(auth(true, user("a")));
    const first = app.client();
    app.as(auth(true, user("b")));
    expect(app.client()).toBe(first);
  });
});

describe("QueryProvider across route groups", () => {
  it("keeps the client and its cache when another group's provider mounts for the same user", () => {
    const app = setup(auth(true, user("a")));
    const first = app.client();
    first.setQueryData(["me"], { user: "a" });

    app.remount(auth(true, user("a")));

    expect(app.client()).toBe(first);
    expect(app.client().getQueryData(["me"])).toEqual({ user: "a" });
  });

  it("keeps the cache while the next provider's auth is still loading", () => {
    const app = setup(auth(true, user("a")));
    app.client().setQueryData(["me"], { user: "a" });

    app.remount(auth(false, null));
    app.as(auth(true, user("a")));

    expect(app.client().getQueryData(["me"])).toEqual({ user: "a" });
  });

  it("clears the cache when the user changed while no provider was mounted", () => {
    const app = setup(auth(true, user("a")));
    app.client().setQueryData(["business", "b1", "detail"], { id: "b1" });

    // Signed out on a marketing page and back in as someone else: the next provider first sees "b".
    app.remount(auth(true, user("b")));

    expect(app.client().getQueryData(["business", "b1", "detail"])).toBeUndefined();
  });

  it("shares the client with public pages, which leave whose cache it is alone", () => {
    const app = setup(auth(true, user("a")));
    app.client().setQueryData(["me"], { user: "a" });
    let publicClient: QueryClient | null = null;
    function Probe() {
      publicClient = useQueryClient();
      return null;
    }
    app.remount(auth(true, user("a")));
    const shared = app.client();
    render(
      <PublicQueryProvider>
        <Probe />
      </PublicQueryProvider>,
    );

    expect(publicClient).toBe(shared);
    expect(shared.getQueryData(["me"])).toEqual({ user: "a" });
  });
});
