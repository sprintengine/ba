/** The marketing nav's "signed in?" hint: no auth provider and no Clerk, just Clerk's cookie or the dev token. */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingNav } from "@/components/shells/marketing-nav";
import { devSignIn, devSignOut } from "./dev-auth";
import { clerkCookieSaysSignedIn, readSignedInHint } from "./signed-in-hint";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => devSignOut());

describe("Clerk's __client_uat cookie", () => {
  it("is signed in when the last sign-in time is set, out when it is 0 or missing", () => {
    expect(clerkCookieSaysSignedIn("__client_uat=1759651200")).toBe(true);
    expect(clerkCookieSaysSignedIn("theme=dark; __client_uat=1759651200; other=1")).toBe(true);
    expect(clerkCookieSaysSignedIn("__client_uat=0")).toBe(false);
    expect(clerkCookieSaysSignedIn("")).toBe(false);
    expect(clerkCookieSaysSignedIn("theme=dark")).toBe(false);
    expect(clerkCookieSaysSignedIn("__client_uat=")).toBe(false);
    expect(clerkCookieSaysSignedIn("__client_uat=nope")).toBe(false);
  });

  it("counts the suffixed cookie of an instance sharing the domain", () => {
    expect(clerkCookieSaysSignedIn("__client_uat_Abc123=0; __client_uat_Xyz789=1759651200")).toBe(true);
    expect(clerkCookieSaysSignedIn("__client_uat=0; __client_uat_Abc123=0")).toBe(false);
    // Only Clerk's names: a look-alike doesn't count.
    expect(clerkCookieSaysSignedIn("my__client_uat=1759651200")).toBe(false);
  });
});

describe("dev auth hint", () => {
  it("follows the dev token in localStorage, ignoring a malformed one", () => {
    expect(readSignedInHint()).toBe(false);
    devSignIn({ sub: "dev_owner", email: "owner@bookanything.test", name: "Demo Owner" });
    expect(readSignedInHint()).toBe(true);
    window.localStorage.setItem("bookanything.devAuth", "not-a-token");
    expect(readSignedInHint()).toBe(false);
  });
});

describe("MarketingNav", () => {
  it("renders without an auth provider and swaps Sign in for Dashboard when signed in", () => {
    render(<MarketingNav />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Start free" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();

    act(() => devSignIn({ sub: "dev_owner", email: "owner@bookanything.test", name: "Demo Owner" }));
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();

    act(() => devSignOut());
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows Dashboard on first render after hydration for someone already signed in", () => {
    devSignIn({ sub: "dev_staff", email: "staff@bookanything.test", name: "Demo Staff" });
    render(<MarketingNav />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });
});
