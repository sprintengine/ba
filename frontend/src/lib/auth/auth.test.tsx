import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "./context";
import {
  accountHomePath,
  afterSignInUrl,
  resolvePostSignInPath,
  safeRedirectPath,
  SignedIn,
  SignedOut,
  signInUrl,
} from "./components";
import { DevAuthProvider } from "./dev-auth-provider";
import {
  decodeDevToken,
  DEV_STORAGE_KEY,
  devSignIn,
  devSignOut,
  devSubForEmail,
  encodeDevToken,
} from "./dev-auth";

describe("dev auth tokens", () => {
  it("round-trips dev.<base64url(json)> including non-ASCII names", () => {
    const token = encodeDevToken({
      sub: "dev_owner",
      email: "owner@bookanything.test",
      name: "Siobhán Ó Súilleabháin",
    });
    expect(token.startsWith("dev.")).toBe(true);
    expect(token).not.toMatch(/[+/=]/);
    expect(decodeDevToken(token)).toEqual({
      sub: "dev_owner",
      email: "owner@bookanything.test",
      name: "Siobhán Ó Súilleabháin",
    });
  });
  it("matches the backend demo subs and derives stable subs for other emails", () => {
    expect(devSubForEmail("Owner@BookAnything.test")).toBe("dev_owner");
    expect(devSubForEmail("customer@bookanything.test")).toBe("dev_customer");
    expect(devSubForEmail("Jane.Doe@example.ie")).toBe("dev_jane_doe_example_ie");
  });
  it("rejects malformed tokens", () => {
    expect(decodeDevToken("nope")).toBeNull();
    expect(decodeDevToken("dev.!!!")).toBeNull();
  });
});

describe("post sign-in routing", () => {
  const member = {
    memberships: [
      {
        businessId: "b",
        slug: "x",
        name: "X",
        role: "owner" as const,
        branding: { primaryColor: "#000000", logoUrl: null, coverImageUrl: null },
      },
    ],
    hasCustomerBookings: false,
  };
  const customer = { memberships: [], hasCustomerBookings: true };
  const newcomer = { memberships: [], hasCustomerBookings: false };
  it("members → dashboard, customers → my bookings, others → onboarding; explicit redirect wins", () => {
    expect(resolvePostSignInPath(member)).toBe("/dashboard");
    expect(resolvePostSignInPath(customer)).toBe("/my/bookings");
    expect(resolvePostSignInPath(newcomer)).toBe("/onboarding");
    expect(resolvePostSignInPath(null)).toBe("/my/bookings");
    expect(resolvePostSignInPath(member, "/lumen-physio")).toBe("/lumen-physio");
    expect(accountHomePath(customer)).toBe("/my/bookings");
    expect(accountHomePath(newcomer)).toBe("/onboarding");
  });
  it("only allows same-origin relative redirects", () => {
    expect(safeRedirectPath("https://evil.example")).toBeNull();
    expect(safeRedirectPath("//evil.example")).toBeNull();
    // The URL parser drops tabs and newlines and reads "\\" as "/", so these are "//evil.example" to the router.
    expect(safeRedirectPath("/\t/evil.example")).toBeNull();
    expect(safeRedirectPath("/\n/evil.example")).toBeNull();
    expect(safeRedirectPath("/\r\\evil.example")).toBeNull();
    expect(safeRedirectPath("/\\evil.example")).toBeNull();
    expect(safeRedirectPath("/sign-in")).toBeNull();
    expect(safeRedirectPath("/dashboard/x?tab=1")).toBe("/dashboard/x?tab=1");
    expect(safeRedirectPath("dashboard")).toBeNull();
  });
  it("takes the path of an absolute URL on this app's origin (Clerk's redirect_url)", () => {
    const here = window.location.origin;
    expect(safeRedirectPath(`${here}/dashboard/x?tab=1#today`)).toBe("/dashboard/x?tab=1#today");
    expect(safeRedirectPath(`${here}/sign-in?redirect_url=%2F`)).toBeNull();
    expect(safeRedirectPath("https://evil.example/dashboard/x")).toBeNull();
    expect(safeRedirectPath(`${here}.evil.example/dashboard`)).toBeNull();
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
    expect(signInUrl(`${here}/my/bookings`)).toBe("/sign-in?redirect_url=%2Fmy%2Fbookings");

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    expect(safeRedirectPath("https://bookanything.ie/onboarding")).toBe("/onboarding");
    expect(safeRedirectPath("https://www.bookanything.ie/onboarding")).toBeNull();
    vi.unstubAllEnvs();
  });
  it("builds sign-in and after-sign-in links that carry only a safe redirect", () => {
    expect(signInUrl("/invitations/tok")).toBe("/sign-in?redirect_url=%2Finvitations%2Ftok");
    expect(signInUrl("https://evil.example")).toBe("/sign-in");
    expect(afterSignInUrl("/onboarding?template=physio")).toBe(
      "/sign-in/done?redirect_url=%2Fonboarding%3Ftemplate%3Dphysio",
    );
    expect(afterSignInUrl("//evil.example")).toBe("/sign-in/done");
    expect(afterSignInUrl(null)).toBe("/sign-in/done");
  });
  it("sends a sign-up to onboarding, unless the account already belongs to a member", () => {
    expect(afterSignInUrl(null, { signUp: true })).toBe("/sign-in/done?intent=sign-up");
    // An explicit redirect still wins (the marketing pages' "/onboarding?template=…", "/my/bookings").
    expect(afterSignInUrl("/my/bookings", { signUp: true })).toBe(
      "/sign-in/done?redirect_url=%2Fmy%2Fbookings",
    );

    const signUp = { signUp: true };
    expect(resolvePostSignInPath(member, null, signUp)).toBe("/dashboard");
    expect(resolvePostSignInPath(customer, null, signUp)).toBe("/onboarding");
    expect(resolvePostSignInPath(newcomer, null, signUp)).toBe("/onboarding");
    expect(resolvePostSignInPath(null, null, signUp)).toBe("/onboarding");
    expect(resolvePostSignInPath(member, "/onboarding?template=physio", signUp)).toBe(
      "/onboarding?template=physio",
    );
  });
});

function Probe() {
  const { isLoaded, isSignedIn, user } = useAuth();
  return <p>{isLoaded ? (isSignedIn ? `in:${user?.email}` : "out") : "loading"}</p>;
}

describe("DevAuthProvider", () => {
  it("reflects localStorage and reacts to sign-in/out", () => {
    render(
      <DevAuthProvider>
        <Probe />
        <SignedIn>signed-in-content</SignedIn>
        <SignedOut>signed-out-content</SignedOut>
      </DevAuthProvider>,
    );
    expect(screen.getByText("out")).toBeInTheDocument();
    expect(screen.getByText("signed-out-content")).toBeInTheDocument();
    act(() => devSignIn({ sub: "dev_staff", email: "staff@bookanything.test", name: "Demo Staff" }));
    expect(screen.getByText("in:staff@bookanything.test")).toBeInTheDocument();
    expect(screen.getByText("signed-in-content")).toBeInTheDocument();
    expect(window.localStorage.getItem(DEV_STORAGE_KEY)).toMatch(/^dev\./);
    act(() => devSignOut());
    expect(screen.getByText("out")).toBeInTheDocument();
  });
});
