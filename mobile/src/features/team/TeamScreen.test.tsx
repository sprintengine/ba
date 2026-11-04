import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { business, me as meFixture, teamMember } from "@shared/api/__tests__/fixtures/business";
import type { Resource, TeamMember } from "@shared/api/types";
import { calls, json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { TeamScreen } from "./TeamScreen";

const ME = "user_me";
const me = { ...meFixture, user: { ...meFixture.user, id: ME } };

const owner: TeamMember = {
  ...teamMember,
  id: "m_owner",
  userId: ME,
  name: "Avery Morgan",
  email: "avery@example.test",
  role: "owner",
  resourceId: null,
};
const admin: TeamMember = {
  ...teamMember,
  id: "m_admin",
  userId: "u2",
  name: "Blake Admin",
  email: "blake@example.test",
  role: "admin",
  resourceId: null,
};
const staff: TeamMember = {
  ...teamMember,
  id: "m_staff",
  userId: "u3",
  name: "Casey Lane",
  email: "casey@example.test",
  role: "staff",
  resourceId: "r_casey",
};
const invited: TeamMember = {
  ...teamMember,
  id: "m_inv",
  userId: null,
  name: null,
  email: "dana@example.test",
  role: "staff",
  status: "invited",
  resourceId: null,
};

const casey: Resource = {
  id: "r_casey",
  kind: "person",
  name: "Casey Lane",
  description: null,
  color: "#0e7c70",
  capacity: 1,
  memberId: "m_staff",
  isActive: true,
  sortOrder: 0,
};
const room: Resource = { ...casey, id: "r_room", kind: "space", name: "Room 1", memberId: null };

const BASE = `/v1/businesses/${business.id}`;

function api(
  members: TeamMember[] = [owner, admin, staff, invited],
  handle?: (method: string, path: string, body: unknown) => unknown,
) {
  return mockApi((method, path, body) => {
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path.endsWith("/team")) return members;
    if (method === "GET" && path.endsWith("/resources")) return [casey, room];
    return undefined;
  });
}

function confirmAlerts() {
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
}

describe("Team", () => {
  it("lists members by role and pending invitations on their own, with what each role can do", async () => {
    api();
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    expect(await screen.findByTestId("member-avery@example.test")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "PENDING INVITATIONS" })).toBeOnTheScreen();
    expect(screen.getByTestId("member-dana@example.test")).toHaveTextContent(/Invited/);
    // The linked calendar shows on the member's row.
    expect(screen.getByTestId("member-casey@example.test")).toHaveTextContent(/Casey Lane/);
    expect(screen.getByText("Roles")).toBeOnTheScreen();
    expect(screen.getByText("Sees and manages their own calendar.")).toBeOnTheScreen();
  });

  it("lets staff see the team but not invite or change anyone", async () => {
    api();
    renderBusinessScreen(<TeamScreen />, { role: "staff", me, path: "team" });
    const row = await screen.findByTestId("member-blake@example.test");
    expect(screen.queryByTestId("team-invite")).toBeNull();
    expect(row).not.toHaveProp("accessibilityRole", "button");
  });

  it("doesn't let an admin change an owner", async () => {
    api();
    renderBusinessScreen(<TeamScreen />, {
      role: "admin",
      me: { ...me, user: { ...me.user, id: "u2" } },
      path: "team",
    });
    expect(await screen.findByTestId("member-avery@example.test")).not.toHaveProp(
      "accessibilityRole",
      "button",
    );
    expect(screen.getByTestId("member-casey@example.test")).toHaveProp("accessibilityRole", "button");
  });

  it("invites someone with a role and calendar", async () => {
    const fetch = api(undefined, (method, path, body) =>
      method === "POST" && path.endsWith("/team/invitations")
        ? { ...invited, id: "m_new", email: (body as { email: string }).email }
        : undefined,
    );
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    fireEvent.press(await screen.findByTestId("team-invite"));
    const sheet = await screen.findByTestId("invite-sheet");
    fireEvent.changeText(within(sheet).getByTestId("invite-email"), "not-an-email");
    fireEvent.press(screen.getByTestId("invite-send"));
    expect(await screen.findByText("Enter a valid email")).toBeOnTheScreen();

    fireEvent.changeText(within(sheet).getByTestId("invite-email"), "jordan@example.com");
    fireEvent.press(within(sheet).getByTestId("invite-role-admin"));
    fireEvent.press(within(sheet).getByTestId("invite-calendar"));
    // People only: rooms and equipment aren't anyone's calendar.
    expect(screen.queryByRole("button", { name: "Room 1" })).toBeNull();
    // The picker sheet lists people only; pick the last match (the option, not a hidden duplicate).
    fireEvent.press((await screen.findAllByRole("button", { name: "Casey Lane" })).at(-1)!);
    fireEvent.press(screen.getByTestId("invite-send"));
    expect(await screen.findByText("Invite sent to jordan@example.com")).toBeOnTheScreen();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      email: "jordan@example.com",
      role: "admin",
      resourceId: "r_casey",
    });
  });

  it("puts the server's field error on the field", async () => {
    api(undefined, (method, path) =>
      method === "POST" && path.endsWith("/team/invitations")
        ? json(
            {
              error: {
                code: "CONFLICT",
                message: "Already on the team",
                fields: { email: "Already a member" },
              },
            },
            409,
          )
        : undefined,
    );
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    fireEvent.press(await screen.findByTestId("team-invite"));
    fireEvent.changeText(await screen.findByTestId("invite-email"), "blake@example.test");
    fireEvent.press(screen.getByTestId("invite-send"));
    expect(await screen.findByText("Already a member")).toBeOnTheScreen();
  });

  it("explains the plan limit and links owners to billing", async () => {
    api(undefined, (method, path) =>
      method === "POST" && path.endsWith("/team/invitations")
        ? json(
            {
              error: {
                code: "PLAN_LIMIT_REACHED",
                message: "The Free plan has up to 3 team members.",
                fields: {},
              },
            },
            409,
          )
        : undefined,
    );
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    fireEvent.press(await screen.findByTestId("team-invite"));
    fireEvent.changeText(await screen.findByTestId("invite-email"), "new@example.test");
    fireEvent.press(screen.getByTestId("invite-send"));
    const limit = await screen.findByTestId("invite-limit");
    expect(limit).toHaveTextContent(/up to 3 team members/);
    expect(within(limit).getByRole("button", { name: "See plans" })).toBeOnTheScreen();
  });

  it("changes a member's role, and puts it back when the server refuses", async () => {
    let fail = false;
    const fetch = api(undefined, (method, path, body) => {
      if (method !== "PATCH") return undefined;
      if (fail) return json({ error: { code: "FORBIDDEN", message: "Not allowed", fields: {} } }, 403);
      return { ...staff, ...(body as object) };
    });
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    fireEvent.press(await screen.findByTestId("member-casey@example.test"));
    const sheet = await screen.findByTestId("member-sheet");
    fireEvent.press(within(sheet).getByTestId("member-role-admin"));
    expect(await screen.findByText("Role updated")).toBeOnTheScreen();
    const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(String(patch[0])).toContain("/team/m_staff");
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ role: "admin" });

    fail = true;
    fireEvent.press(within(sheet).getByTestId("member-role-owner"));
    expect(within(sheet).getByTestId("member-role-owner")).toBeChecked();
    expect(await screen.findByText("Not allowed")).toBeOnTheScreen();
    await waitFor(() => expect(within(sheet).getByTestId("member-role-owner")).not.toBeChecked());
  });

  it("removes a member after confirming", async () => {
    confirmAlerts();
    const fetch = api(undefined, (method) =>
      method === "DELETE" ? new Response(null, { status: 204 }) : undefined,
    );
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    fireEvent.press(await screen.findByTestId("member-casey@example.test"));
    fireEvent.press(await screen.findByTestId("member-remove"));
    expect(await screen.findByText("Removed from the team")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`DELETE ${BASE}/team/m_staff`);
  });

  it("keeps the last owner: no role change, no removal", async () => {
    api();
    renderBusinessScreen(<TeamScreen />, {
      role: "owner",
      me: { ...me, user: { ...me.user, id: "someone-else" } },
      path: "team",
    });
    fireEvent.press(await screen.findByTestId("member-avery@example.test"));
    const sheet = await screen.findByTestId("member-sheet");
    expect(within(sheet).getByText("Every business needs at least one owner.")).toBeOnTheScreen();
    expect(within(sheet).getByText("The last owner can't be removed.")).toBeOnTheScreen();
    expect(within(sheet).queryByTestId("member-remove")).toBeNull();
  });

  it("revokes an invitation", async () => {
    confirmAlerts();
    api(undefined, (method) => (method === "DELETE" ? new Response(null, { status: 204 }) : undefined));
    renderBusinessScreen(<TeamScreen />, { role: "admin", me, path: "team" });
    fireEvent.press(await screen.findByTestId("member-dana@example.test"));
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Revoke invite" })));
    expect(await screen.findByText("Invite revoked")).toBeOnTheScreen();
  });

  it("shows an error with a retry when the team can't load", async () => {
    let failing = true;
    mockApi((method, path) => {
      if (path.endsWith("/team"))
        return failing
          ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
          : [owner];
      if (path.endsWith("/resources")) return [];
      return undefined;
    });
    renderBusinessScreen(<TeamScreen />, { role: "owner", me, path: "team" });
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    failing = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("member-avery@example.test")).toBeOnTheScreen();
  });
});
