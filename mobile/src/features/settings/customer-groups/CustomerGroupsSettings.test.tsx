import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { customerGroup } from "@shared/api/__tests__/fixtures/catalog";
import type { CustomerGroup } from "@shared/api/types";
import { apiError, json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { CustomerGroupsSettings } from "./CustomerGroupsSettings";
import { groupRows } from "./groups";

const PATH = `/v1/businesses/${business.id}/customer-groups`;

const medical: CustomerGroup = {
  id: "00000000-0000-4000-8000-000000000041",
  name: "Medical card holders",
  description: null,
  restricted: true,
  sortOrder: 1,
  isActive: true,
};
const old: CustomerGroup = {
  id: "00000000-0000-4000-8000-000000000042",
  name: "Old members",
  description: "Before 2024",
  restricted: false,
  sortOrder: 2,
  isActive: false,
};

type Req = { method: string; path: string; body: unknown };

function api({
  groups = [old, medical, customerGroup],
  handle,
}: {
  groups?: CustomerGroup[] | (() => unknown);
  handle?: (method: string, path: string, body: unknown) => unknown;
} = {}) {
  const writes: Req[] = [];
  mockApi((method, path, body) => {
    if (method !== "GET") writes.push({ method, path, body });
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === PATH) return typeof groups === "function" ? groups() : groups;
    if (method === "POST" && path === PATH) return { ...customerGroup, ...(body as object), id: "new" };
    if (method === "PATCH") return { ...customerGroup, ...(body as object) };
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { writes };
}

const render = () => renderBusinessScreen(<CustomerGroupsSettings />, { path: "settings/customer-groups" });

describe("Settings › Customer groups", () => {
  it("lists active groups first, then the inactive ones, with their marks", async () => {
    api();
    render();
    expect(await screen.findByTestId(`group-${customerGroup.id}`)).toHaveAccessibleName(
      "Members, Club members get evening slots.",
    );
    expect(screen.getByTestId(`group-${medical.id}`)).toHaveAccessibleName(
      "Medical card holders, restricted",
    );
    expect(screen.getByTestId(`group-${old.id}`)).toHaveAccessibleName("Old members, inactive, Before 2024");
    expect(screen.getByText("INACTIVE")).toBeOnTheScreen();
    // The website's explanation, in the business's words.
    expect(screen.getByText(/Groups let some patients see different hours or services/)).toBeOnTheScreen();
  });

  it("adds a group with the exact body, after checking it has a name", async () => {
    const { writes } = api();
    render();
    fireEvent.press(await screen.findByTestId("group-new"));
    expect(await screen.findByTestId("group-sheet")).toBeOnTheScreen();
    expect(screen.queryByTestId("group-active")).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId("group-save")));
    expect(await screen.findByText("Name the group")).toBeOnTheScreen();
    expect(writes).toEqual([]);

    fireEvent.changeText(screen.getByTestId("group-name"), " Students ");
    fireEvent.changeText(screen.getByTestId("group-description"), "With a student card");
    fireEvent(screen.getByTestId("group-restricted"), "valueChange", true);
    await act(async () => fireEvent.press(screen.getByTestId("group-save")));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: "POST",
      path: PATH,
      body: {
        name: "Students",
        description: "With a student card",
        restricted: true,
        isActive: true,
        sortOrder: 3,
      },
    });
    expect(await screen.findByText("Group added")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("group-sheet")).toBeNull());
  });

  it("edits a group, showing the server's field errors", async () => {
    const { writes } = api({
      handle: (method) =>
        method === "PATCH"
          ? json(
              {
                error: {
                  code: "INVALID_REQUEST",
                  message: "Check the fields",
                  fields: { name: "Already used" },
                },
              },
              400,
            )
          : undefined,
    });
    render();
    fireEvent.press(await screen.findByTestId(`group-${medical.id}`));
    expect(await screen.findByTestId("group-name")).toHaveDisplayValue("Medical card holders");
    fireEvent(screen.getByTestId("group-active"), "valueChange", false);
    await act(async () => fireEvent.press(screen.getByTestId("group-save")));
    expect(await screen.findByText("Already used")).toBeOnTheScreen();
    expect(writes[0]).toEqual({
      method: "PATCH",
      path: `${PATH}/${medical.id}`,
      body: {
        name: "Medical card holders",
        description: null,
        restricted: true,
        isActive: false,
        sortOrder: 1,
      },
    });
  });

  it("deletes a group after confirming", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const { writes } = api();
    render();
    fireEvent.press(await screen.findByTestId(`group-${customerGroup.id}`));
    await act(async () => fireEvent.press(await screen.findByTestId("group-delete")));
    expect(alert.mock.calls[0]?.[0]).toBe("Delete Members?");
    await waitFor(() =>
      expect(writes).toEqual([{ method: "DELETE", path: `${PATH}/${customerGroup.id}`, body: undefined }]),
    );
    expect(await screen.findByText("Group removed")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("group-sheet")).toBeNull());
  });

  it("keeps the sheet open when deleting is cancelled or fails", async () => {
    let confirm = false;
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => (confirm ? b.style === "destructive" : b.style === "cancel"))?.onPress?.();
    });
    const { writes } = api({
      handle: (method) =>
        method === "DELETE" ? apiError(409, "CONFLICT", "Can't delete right now") : undefined,
    });
    render();
    fireEvent.press(await screen.findByTestId(`group-${customerGroup.id}`));
    await act(async () => fireEvent.press(await screen.findByTestId("group-delete")));
    expect(writes).toEqual([]);
    confirm = true;
    fireEvent.press(screen.getByTestId("group-delete"));
    expect(await screen.findByText("Can't delete right now")).toBeOnTheScreen();
    expect(screen.getByTestId("group-sheet")).toBeOnTheScreen();
  });

  it("asks before closing a sheet with changes", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    api();
    render();
    fireEvent.press(await screen.findByTestId("group-new"));
    fireEvent.changeText(await screen.findByTestId("group-name"), "VIP");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Close" })));
    expect(alert).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("group-sheet")).toBeNull());
  });

  it("closes an unchanged sheet at once", async () => {
    const alert = jest.spyOn(Alert, "alert");
    api();
    render();
    fireEvent.press(await screen.findByTestId("group-new"));
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Close" })));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId("group-sheet")).toBeNull();
  });

  it("shows the empty state", async () => {
    api({ groups: [] });
    render();
    expect(await screen.findByTestId("groups-empty")).toBeOnTheScreen();
  });

  it("shows an error with a retry", async () => {
    let fail = true;
    api({ groups: () => (fail ? apiError(500, "INTERNAL", "Groups are down") : [customerGroup]) });
    render();
    expect(await screen.findByText("Groups are down")).toBeOnTheScreen();
    fail = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: /try again/i })));
    expect(await screen.findByTestId(`group-${customerGroup.id}`)).toBeOnTheScreen();
  });
});

describe("groupRows", () => {
  it("has no Inactive header when every group is active", () => {
    expect(groupRows([medical, customerGroup]).map((r) => r.key)).toEqual([customerGroup.id, medical.id]);
  });
});
