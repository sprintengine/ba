import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { useAuth } from "@shared/auth/context";
import { AccountDeletionError, useAccountDeletion, type AccountDeletion } from "./account-deletion";
import { beforeSignOut } from "./before-sign-out";
import { ClerkAuthProvider, deletionError } from "./ClerkAuthProvider";
import { DevAuthProvider } from "./DevAuthProvider";

const mockSteps: string[] = [];
const mockClerkUser = {
  id: "user_1",
  primaryEmailAddress: { emailAddress: "avery@example.test" },
  fullName: "Avery Morgan",
  imageUrl: "",
  deleteSelfEnabled: true,
  delete: jest.fn(() => {
    mockSteps.push("delete");
    return Promise.resolve();
  }),
};
const mockClerkSignOut = jest.fn(() => {
  mockSteps.push("sign out");
  return Promise.resolve();
});

class MockClerkApiError extends Error {
  constructor(readonly errors: { code: string; message: string; longMessage?: string }[]) {
    super("Clerk API error");
  }
}

jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: () => Promise.resolve("jwt"),
    signOut: mockClerkSignOut,
  }),
  useUser: () => ({ user: mockClerkUser }),
  isClerkAPIResponseError: (e: unknown) => e instanceof MockClerkApiError,
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));

/** What a component inside [provider] gets. */
function capture(provider: "clerk" | "dev") {
  const seen: { deletion?: AccountDeletion; mode?: string } = {};
  function Probe() {
    seen.deletion = useAccountDeletion();
    seen.mode = useAuth().mode;
    return null;
  }
  const ui: ReactElement =
    provider === "clerk" ? (
      <ClerkAuthProvider publishableKey="pk_test">
        <Probe />
      </ClerkAuthProvider>
    ) : (
      <DevAuthProvider>
        <Probe />
      </DevAuthProvider>
    );
  render(ui);
  return seen;
}

describe("account deletion", () => {
  beforeEach(() => {
    mockSteps.length = 0;
    mockClerkUser.deleteSelfEnabled = true;
    mockClerkSignOut.mockClear();
  });

  it("with Clerk: deletes the user, then the sign-out tasks, then signs out here", async () => {
    const off = beforeSignOut(async () => {
      mockSteps.push("before sign-out");
    });
    const { deletion, mode } = capture("clerk");
    expect(mode).toBe("clerk");
    if (!deletion?.available) throw new Error("expected deletion to be available");
    await deletion.deleteAccount();
    expect(mockSteps).toEqual(["delete", "before sign-out", "sign out"]);
    off();
  });

  it("with Clerk: unavailable when the dashboard doesn't let users delete themselves", () => {
    mockClerkUser.deleteSelfEnabled = false;
    expect(capture("clerk").deletion).toEqual({ available: false, reason: expect.any(String) });
  });

  it("with Clerk: a failed deletion signs nobody out, and says why", async () => {
    mockClerkUser.delete.mockRejectedValueOnce(
      new MockClerkApiError([{ code: "session_reverification_required", message: "Reverify" }]),
    );
    const { deletion } = capture("clerk");
    if (!deletion?.available) throw new Error("expected deletion to be available");
    await expect(deletion.deleteAccount()).rejects.toMatchObject({ reason: "reverify" });
    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });

  it("puts Clerk's errors in words", () => {
    expect(
      deletionError(new MockClerkApiError([{ code: "x", message: "Short", longMessage: "The long one." }])),
    ).toEqual(new AccountDeletionError("failed", "The long one."));
    expect(deletionError(new TypeError("Network request failed")).message).toMatch(/Check your connection/);
  });

  it("with dev auth: unavailable, saying why", () => {
    const { deletion, mode } = capture("dev");
    expect(mode).toBe("dev");
    expect(deletion).toEqual({
      available: false,
      reason: expect.stringMatching(/^Development sign-in has no account to delete/),
    });
  });
});
