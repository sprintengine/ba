import { safeReturnTo, signInHref } from "./return-to";

describe("returnTo", () => {
  it("accepts a path inside the app", () => {
    expect(safeReturnTo("/invitations/inv_7Kq2")).toBe("/invitations/inv_7Kq2");
    expect(safeReturnTo("/my/approvals/abc?from=email")).toBe("/my/approvals/abc?from=email");
  });

  it("refuses anything that could leave the app or loop", () => {
    for (const value of [
      undefined,
      ["/my"],
      "",
      "my/bookings",
      "//evil.example/x",
      "https://evil.example",
      "javascript:alert(1)",
      "/\\evil.example",
      "/\t/evil.example",
      "/my bookings",
      "/sign-in",
      "/sign-in?returnTo=/my",
      `/${"a".repeat(3000)}`,
    ]) {
      expect(safeReturnTo(value)).toBeNull();
    }
  });

  it("builds sign-in with a safe return path only", () => {
    expect(signInHref("/invitations/x")).toEqual({
      pathname: "/sign-in",
      params: { returnTo: "/invitations/x" },
    });
    expect(signInHref("//evil.example")).toBe("/sign-in");
    expect(signInHref(null)).toBe("/sign-in");
  });
});
