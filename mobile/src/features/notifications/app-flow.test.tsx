/** Whole-app flows on the real routes: the bell → inbox → an approval; Bo from a business header. */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { business as businessFixture, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import { notification } from "@shared/api/__tests__/fixtures/notifications";
import type { Business, Me } from "@shared/api/types";
import { DEMO_ACCOUNTS } from "@shared/auth/dev-token";
import { mockApi } from "~/test/api-mock";
import { renderApp } from "~/test/app";
import * as layout from "~/ui/layout";
import { credits } from "../assistant/fake-assistant-api";

const owner = DEMO_ACCOUNTS.find((a) => a.sub === "dev_owner")!;
const business: Business = { ...businessFixture, slug: "lumen-physio" };
const memberMe: Me = {
  ...meFixture,
  pendingInvitations: [],
  memberships: [{ ...meFixture.memberships[0]!, slug: "lumen-physio", role: "owner" }],
};
const approval = { ...notification, link: "/my/approvals/r1", title: "Claude wants to: Book Consult" };

function api() {
  return mockApi((method, path) => {
    if (path === "/v1/me") return memberMe;
    if (path === "/v1/me/notifications") return { items: [approval], unreadCount: 1 };
    if (path.endsWith("/read")) return new Response(null, { status: 204 });
    if (path === `/v1/businesses/lumen-physio` || path === `/v1/businesses/${business.id}`) return business;
    if (path.endsWith("/assistant"))
      return { configured: true, credits: credits(), nudges: [], threads: [], canEditMemory: true };
    return undefined;
  });
}

beforeEach(() => {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
});

it("bell → inbox → the approval the notification is about", async () => {
  api();
  const app = renderApp({ signedInAs: owner, initialUrl: "/dashboard/lumen-physio" });
  fireEvent.press(await screen.findByRole("button", { name: "Notifications, 1 new" }));
  fireEvent.press(await screen.findByTestId(`notification-${approval.id}`));
  // The approval screen is another feature's: only where we land is checked.
  await waitFor(() => expect(app.getPathname()).toBe("/my/approvals/r1"));
});

it("on a wide window Bo opens beside the content, and closes again", async () => {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: true, width: 1180, height: 820 });
  api();
  const app = renderApp({ signedInAs: owner, initialUrl: "/dashboard/lumen-physio" });
  fireEvent.press(await screen.findByTestId("header-assistant"));
  expect(await screen.findByTestId("assistant-dock")).toBeOnTheScreen();
  expect(app.getPathname()).toBe("/dashboard/lumen-physio");
  expect(await screen.findByText(/AI credits left/)).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId("assistant-close"));
  await waitFor(() => expect(screen.queryByText(/AI credits left/)).toBeNull());
});

it("Bo opens from a business screen's header", async () => {
  api();
  const app = renderApp({ signedInAs: owner, initialUrl: "/dashboard/lumen-physio" });
  fireEvent.press(await screen.findByTestId("header-assistant"));
  expect(await screen.findByTestId("assistant-panel")).toBeOnTheScreen();
  expect(app.getPathname()).toBe("/assistant");
  expect(await screen.findByText(/AI credits left/)).toBeOnTheScreen();
});
