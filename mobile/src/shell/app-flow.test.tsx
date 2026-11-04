import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { customerBooking } from "@shared/api/__tests__/fixtures/bookings";
import { business as businessFixture, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import type { Business, Me, MemberRole } from "@shared/api/types";
import { DEMO_ACCOUNTS } from "@shared/auth/dev-token";
import { mockApi } from "~/test/api-mock";
import { renderApp } from "~/test/app";
import * as layout from "~/ui/layout";

const customer = DEMO_ACCOUNTS.find((a) => a.sub === "dev_customer")!;
const owner = DEMO_ACCOUNTS.find((a) => a.sub === "dev_owner")!;

const customerMe: Me = { ...meFixture, memberships: [], pendingInvitations: [], hasCustomerBookings: true };
const memberMe = (role: MemberRole): Me => ({
  ...meFixture,
  pendingInvitations: [],
  memberships: [{ ...meFixture.memberships[0]!, slug: "lumen-physio", role }],
});
const business: Business = { ...businessFixture, slug: "lumen-physio", sitesEnabled: true };

function api(me: Me) {
  return mockApi((method, path) => {
    if (path === "/v1/me") return me;
    if (path === "/v1/me/bookings") return { upcoming: [customerBooking], past: [] };
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 2 };
    if (path === `/v1/businesses/lumen-physio` || path === `/v1/businesses/${business.id}`) return business;
    return undefined;
  });
}

describe("app flows", () => {
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
  });

  it("launch → dev sign-in → My bookings", async () => {
    const fetch = api(customerMe);
    const app = renderApp();
    fireEvent.press(await screen.findByTestId("dev-sign-in-dev_customer"));
    expect(await screen.findByTestId(`booking-${customerBooking.reference}`)).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/my/bookings");
    expect(screen.getByTestId("tab-bookings")).toBeSelected();
    // The bearer token is the dev token for the account picked.
    const [, init] = fetch.mock.calls.find(([url]) => String(url).endsWith("/v1/me"))!;
    expect((init!.headers as Record<string, string>).Authorization).toMatch(/^Bearer dev\./);
  });

  it("opens a member's business, with the website's sections for their role", async () => {
    api(memberMe("staff"));
    const app = renderApp({ signedInAs: owner });
    expect(await screen.findByTestId("today")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/dashboard/lumen-physio");
    fireEvent.press(screen.getByTestId("tab-more"));
    expect(await screen.findByTestId("more-services")).toBeOnTheScreen();
    expect(screen.queryByTestId("more-offers")).toBeNull();
    expect(screen.queryByTestId("more-settings")).toBeNull();
    expect(screen.getByRole("button", { name: "Notifications, 2 new" })).toBeOnTheScreen();
  });

  it("guards a section above the member's role when deep-linked", async () => {
    api(memberMe("staff"));
    renderApp({ signedInAs: owner, initialUrl: "/dashboard/lumen-physio/offers" });
    expect(await screen.findByTestId("forbidden")).toBeOnTheScreen();
  });

  it("tells someone who isn't a member of the business", async () => {
    api(customerMe);
    renderApp({ signedInAs: customer, initialUrl: "/dashboard/lumen-physio" });
    expect(await screen.findByTestId("not-a-member")).toBeOnTheScreen();
  });

  it("shows the sidebar and the business switcher on large screens", async () => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: true, width: 1180, height: 820 });
    api(memberMe("owner"));
    renderApp({ signedInAs: owner, initialUrl: "/dashboard/lumen-physio" });
    expect(await screen.findByTestId("business-switcher")).toBeOnTheScreen();
    expect(screen.getByTestId("tab-settings")).toBeOnTheScreen();
    expect(screen.queryByTestId("tab-more")).toBeNull();
    fireEvent.press(screen.getByTestId("tab-settings"));
    expect(await screen.findByTestId("settings-general")).toBeOnTheScreen();
  });

  it("signs out from Account", async () => {
    // Confirm through the native alert's destructive button.
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    api(customerMe);
    const app = renderApp({ signedInAs: customer, initialUrl: "/my" });
    fireEvent.press(await screen.findByTestId("sign-out"));
    await waitFor(() => expect(app.getPathname()).toBe("/sign-in"));
    // Not back to Account afterwards: whoever signs in next starts at their own home.
    expect(app.getSearchParams()).toEqual({});
  });

  it("a business's link opened signed out goes through sign-in to the business", async () => {
    api(memberMe("owner"));
    const app = renderApp({ initialUrl: "/dashboard/lumen-physio/bookings" });
    fireEvent.press(await screen.findByTestId("dev-sign-in-dev_owner"));
    await waitFor(() => expect(app.getPathname()).toBe("/dashboard/lumen-physio/bookings"));
  });
});
