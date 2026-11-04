import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { acceptedInvitation, me } from "@shared/api/__tests__/fixtures/business";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { renderScreen } from "~/test/render";
import { invitationErrorView, joinedHref } from "./invitation";
import { InvitationScreen } from "./InvitationScreen";

jest.mock("expo-router", () => {
  const actual = jest.requireActual<typeof import("expo-router")>("expo-router");
  return { ...actual, useLocalSearchParams: jest.fn(() => ({ token: "inv_7Kq2" })) };
});

const ACCEPT = "/v1/invitations/inv_7Kq2/accept";
const slug = me.memberships[0]!.slug;

function setup(accept: () => unknown) {
  return mockApi((method, path) => {
    if (path === "/v1/me") return me;
    if (method === "POST" && path === ACCEPT) return accept();
    return undefined;
  });
}

const routes = {
  "dashboard/[slug]": () => <></>,
  "dashboard/index": () => <></>,
  "my/bookings/index": () => <></>,
};

describe("InvitationScreen", () => {
  it("accepts once after /me, says so, then opens the business", async () => {
    const api = setup(() => acceptedInvitation);
    const app = renderScreen(<InvitationScreen />, { routes });
    expect(screen.getByText("Joining the team…")).toBeOnTheScreen();
    expect(await screen.findByText(`You've joined ${me.memberships[0]!.name}`)).toBeOnTheScreen();
    await waitFor(() => expect(app.getPathname()).toBe(`/dashboard/${slug}`), { timeout: 3000 });
    expect(calls(api)).toEqual(["GET /v1/me", `POST ${ACCEPT}`]);
  });

  it("opens the business straight away with Open dashboard", async () => {
    setup(() => acceptedInvitation);
    const app = renderScreen(<InvitationScreen />, { routes });
    fireEvent.press(await screen.findByTestId("invitation-open"));
    await waitFor(() => expect(app.getPathname()).toBe(`/dashboard/${slug}`));
  });

  it("explains an invitation that isn't valid any more", async () => {
    setup(() => apiError(404, "NOT_FOUND", "Invitation not found."));
    renderScreen(<InvitationScreen />, { routes });
    expect(await screen.findByText("This invitation isn't valid anymore")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toBeOnTheScreen();
  });

  it("explains when you're already on the team", async () => {
    setup(() => apiError(409, "CONFLICT", "Already a member."));
    renderScreen(<InvitationScreen />, { routes });
    expect(await screen.findByText("You're already on the team")).toBeOnTheScreen();
  });
});

describe("invitation wording", () => {
  it("chooses the way out and offers another account to people without access", () => {
    expect(joinedHref(null)).toBe("/dashboard");
    expect(joinedHref("lumen")).toBe("/dashboard/lumen");
    const view = invitationErrorView(new Error("Boom"), { hasAccess: false, email: "a@b.c" });
    expect(view).toMatchObject({
      title: "We couldn't accept this invitation",
      next: "bookings",
      offerOtherAccount: true,
    });
  });
});
