/** The website's URLs for the customer screens open them in the app (the real routes, in memory). */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { managedBooking } from "@shared/api/__tests__/fixtures/bookings";
import { customerAgentRequestSparse } from "@shared/api/__tests__/fixtures/notifications";
import { acceptedInvitation, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import { DEMO_ACCOUNTS } from "@shared/auth/dev-token";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { renderApp } from "~/test/app";
import { business, freeService } from "~/test/customer";
import * as layout from "~/ui/layout";

const customer = DEMO_ACCOUNTS.find((a) => a.sub === "dev_customer")!;

function api() {
  return mockApi((method, path) => {
    if (path === "/v1/me") return { ...meFixture, memberships: [], pendingInvitations: [] };
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    if (path === `/v1/public/businesses/${business.slug}`) return business;
    if (path === `/v1/public/businesses/${business.slug}/services`) return [freeService];
    if (path === `/v1/public/businesses/${business.slug}/offers`) return [];
    if (path === "/v1/public/marketplace/meta") return { categories: [], cities: [] };
    if (path === "/v1/public/marketplace/search") return { items: [], nextCursor: null, center: null };
    if (path === "/v1/public/manage/tok123") return managedBooking;
    if (path.startsWith("/v1/me/agent-requests/")) return customerAgentRequestSparse;
    if (method === "POST" && path === "/v1/invitations/inv_7Kq2/accept") return acceptedInvitation;
    return undefined;
  });
}

describe("customer deep links", () => {
  let fetch: jest.Mock;
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
    fetch = api();
  });

  it("/[slug]/book?service= opens the flow at that service's times", async () => {
    renderApp({ signedInAs: customer, initialUrl: `/${business.slug}/book?service=${freeService.id}` });
    expect(await screen.findByTestId("booking-flow")).toBeOnTheScreen();
    expect(await screen.findByText("Pick a time")).toBeOnTheScreen();
  });

  it("/[slug] opens the business", async () => {
    renderApp({ signedInAs: customer, initialUrl: `/${business.slug}` });
    expect(await screen.findByTestId("business-page")).toBeOnTheScreen();
  });

  it("/explore/[city]/[category] opens Explore", async () => {
    renderApp({ signedInAs: customer, initialUrl: "/explore/galway/physio" });
    expect(await screen.findByTestId("explore")).toBeOnTheScreen();
  });

  it("/manage/[token] opens the booking, signed out too", async () => {
    renderApp({ initialUrl: "/manage/tok123?booked=1" });
    expect(await screen.findByTestId("manage-booking")).toBeOnTheScreen();
    expect(screen.getByText("You're booked")).toBeOnTheScreen();
  });

  it("/my/approvals/[id] opens the request", async () => {
    renderApp({ signedInAs: customer, initialUrl: `/my/approvals/${customerAgentRequestSparse.action.id}` });
    expect(await screen.findByTestId(`request-${customerAgentRequestSparse.action.id}`)).toBeOnTheScreen();
  });

  describe("signed out", () => {
    it("/[slug]/book opens the booking flow for a guest, with Sign in instead of the bell", async () => {
      const app = renderApp({ initialUrl: `/${business.slug}/book?service=${freeService.id}` });
      expect(await screen.findByTestId("booking-flow")).toBeOnTheScreen();
      expect(await screen.findByText("Pick a time")).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/${business.slug}/book`);
      expect(screen.getByTestId("header-sign-in")).toBeOnTheScreen();
      expect(screen.queryByTestId("header-notifications")).toBeNull();
      // No tabs that need an account, and nothing authenticated is asked for.
      expect(screen.queryByTestId("tab-bookings")).toBeNull();
      expect(calls(fetch).filter((c) => c.includes("/v1/me"))).toEqual([]);
    });

    it("/[slug] and /explore open too", async () => {
      renderApp({ initialUrl: `/${business.slug}` });
      expect(await screen.findByTestId("business-page")).toBeOnTheScreen();
      screen.unmount();
      renderApp({ initialUrl: "/explore/galway/physio" });
      expect(await screen.findByTestId("explore")).toBeOnTheScreen();
    });

    it("signing in from the booking flow comes back to it", async () => {
      const app = renderApp({ initialUrl: `/${business.slug}/book?service=${freeService.id}` });
      fireEvent.press(await screen.findByTestId("header-sign-in"));
      fireEvent.press(await screen.findByTestId("dev-sign-in-dev_customer"));
      await waitFor(() => expect(app.getPathname()).toBe(`/${business.slug}/book`));
      expect(await screen.findByTestId("booking-flow")).toBeOnTheScreen();
      expect(await screen.findByTestId("header-notifications")).toBeOnTheScreen();
    });

    it("/invitations/[token] goes through sign-in and comes back to the invitation", async () => {
      const app = renderApp({ initialUrl: "/invitations/inv_7Kq2" });
      fireEvent.press(await screen.findByTestId("dev-sign-in-dev_customer"));
      expect(await screen.findByText(`You've joined ${meFixture.memberships[0]!.name}`)).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/invitations/inv_7Kq2");
      expect(calls(fetch)).toContain("POST /v1/invitations/inv_7Kq2/accept");
    });

    it("an invitation's 'Use a different account' comes back to the invitation", async () => {
      mockApi((_method, path) => {
        if (path === "/v1/me") return { ...meFixture, memberships: [], pendingInvitations: [] };
        if (path === "/v1/invitations/inv_7Kq2/accept") return apiError(404, "NOT_FOUND", "Not for you.");
        return undefined;
      });
      const app = renderApp({ signedInAs: customer, initialUrl: "/invitations/inv_7Kq2" });
      fireEvent.press(await screen.findByRole("button", { name: "Use a different account" }));
      await waitFor(() => expect(app.getPathname()).toBe("/sign-in"));
      expect(app.getSearchParams()).toEqual({ returnTo: "/invitations/inv_7Kq2" });
    });

    it("/my/approvals/[id] goes through sign-in and comes back to the request", async () => {
      const id = customerAgentRequestSparse.action.id;
      const app = renderApp({ initialUrl: `/my/approvals/${id}` });
      expect(await screen.findByTestId("dev-sign-in-dev_customer")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/sign-in");
      expect(app.getSearchParams()).toEqual({ returnTo: `/my/approvals/${id}` });
      fireEvent.press(screen.getByTestId("dev-sign-in-dev_customer"));
      expect(await screen.findByTestId(`request-${id}`)).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/my/approvals/${id}`);
    });

    it("ignores a return path that would leave the app", async () => {
      const app = renderApp({ initialUrl: `/sign-in?returnTo=${encodeURIComponent("//evil.example/x")}` });
      fireEvent.press(await screen.findByTestId("dev-sign-in-dev_customer"));
      // Their home instead.
      await waitFor(() => expect(app.getPathname()).toBe("/my/bookings"));
    });
  });
});
