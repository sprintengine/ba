import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { ResourcesView } from "../resources-view";
import { apiError, fakeResourcesApi, member, override, resource, rule } from "./fake-resources-api";

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/dashboard/lumen-physio/resources",
  useSearchParams: () => nav.params,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  // useUrlParams changes the URL with history.replaceState (Next's router follows it): record it as a replace.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) =>
    nav.replace(String(url), { scroll: false }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  nav.replace.mockReset();
  vi.restoreAllMocks();
  nav.params = new URLSearchParams();
  toast.success.mockReset();
  toast.error.mockReset();
});

const sam = resource({ id: "r1", name: "Sam Rivers", memberId: "m2", sortOrder: 1 });
const jo = resource({ id: "r2", name: "Jo Park", sortOrder: 0 });
const room = resource({ id: "r3", name: "Room 1", kind: "space", capacity: 4, sortOrder: 2 });
const old = resource({ id: "r4", name: "Old couch", kind: "equipment", isActive: false, sortOrder: -1 });
const team = [
  member(),
  member({ id: "m2", userId: "u2", name: "Samantha Rivers", email: "sam@example.test", role: "staff" }),
];

const navList = () => screen.findByRole("navigation", { name: "Therapists" });

describe("ResourcesView", () => {
  it("shows a loading state while the resources load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderDashboard(<ResourcesView />);
    expect(screen.getByRole("heading", { level: 1, name: "Therapists" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading therapists" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the API's error with a retry that loads the list", async () => {
    const api = fakeResourcesApi({ resources: [sam], team });
    api.fail("GET", /\/resources$/, () => apiError(500, "INTERNAL", "The database is resting."));
    const user = userEvent.setup();
    const { container } = renderDashboard(<ResourcesView />);

    expect(await screen.findByText("The database is resting.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "This didn’t load" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await navList()).toBeInTheDocument();
  });

  it("invites an admin to add the first resource when there are none", async () => {
    fakeResourcesApi({ team });
    const user = userEvent.setup();
    const { container } = renderDashboard(<ResourcesView />);

    expect(await screen.findByRole("heading", { level: 2, name: "No therapists yet" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    const adds = screen.getAllByRole("button", { name: "Add therapist" });
    expect(adds).toHaveLength(2);
    await user.click(must(adds[1], "empty-state add button"));
    expect(await screen.findByRole("dialog", { name: "Add a therapist" })).toBeInTheDocument();
  });

  it("tells staff without a calendar to ask an admin, with nothing to add", async () => {
    fakeResourcesApi({ team });
    renderDashboard(<ResourcesView />, "staff");
    expect(
      await screen.findByRole("heading", { name: "You're not linked to a calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your working hours and time off.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add therapist/i })).not.toBeInTheDocument();
  });

  it("lists active resources first in order, describing each, and selects the first", async () => {
    fakeResourcesApi({ resources: [old, room, sam, jo], team, rules: { r2: [rule({ resourceId: "r2" })] } });
    const { container } = renderDashboard(<ResourcesView />);

    const list = await navList();
    const items = within(list).getAllByRole("button");
    expect(items.map((b) => b.textContent)).toEqual([
      "Jo ParkNot linked",
      "Sam RiversLinked to Samantha Rivers",
      "Room 1Space · 4 places",
      "Old couchInactive",
    ]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 2, name: "Jo Park" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Edit Monday: / })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Closed days" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("selects a resource through the URL and switches on click", async () => {
    nav.params = new URLSearchParams("r=r3");
    fakeResourcesApi({ resources: [sam, room], team });
    const user = userEvent.setup();
    renderDashboard(<ResourcesView />);

    expect(await screen.findByRole("heading", { level: 2, name: /Room 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Room 1/, current: true })).toBeInTheDocument();
    await user.click(within(await navList()).getByRole("button", { name: /Sam Rivers/ }));
    expect(nav.replace).toHaveBeenCalledWith("/dashboard/lumen-physio/resources?r=r1", { scroll: false });
  });

  it("marks an inactive resource and names who it is linked to", async () => {
    fakeResourcesApi({
      resources: [resource({ ...sam, isActive: false, description: "Sports injuries" })],
      team,
    });
    renderDashboard(<ResourcesView />);
    const heading = await screen.findByRole("heading", { level: 2, name: /Sam Rivers/ });
    expect(within(heading).getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Sports injuries")).toBeInTheDocument();
    expect(screen.getByText("· Samantha Rivers")).toBeInTheDocument();
  });

  it("opens the edit dialog for the selected resource", async () => {
    fakeResourcesApi({ resources: [sam], team });
    const user = userEvent.setup();
    renderDashboard(<ResourcesView />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit Sam Rivers" })).toBeInTheDocument();
  });

  it("moves between hours and time off with the arrow keys", async () => {
    fakeResourcesApi({
      resources: [sam],
      team,
      overrides: [override({ id: "o1", date: "2026-10-12", reason: "Course" })],
    });
    const user = userEvent.setup();
    renderDashboard(<ResourcesView />);
    const hours = await screen.findByRole("tab", { name: "Weekly hours" });
    hours.focus();
    await user.keyboard("{ArrowRight}");
    const timeOff = screen.getByRole("tab", { name: "Time off and extra hours" });
    expect(timeOff).toHaveFocus();
    expect(timeOff).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/All day · Course/)).toBeInTheDocument();
  });

  it("keeps unsaved weekly hours across a look at time off", async () => {
    fakeResourcesApi({ resources: [sam], team });
    const user = userEvent.setup();
    renderDashboard(<ResourcesView />);
    await user.click(await screen.findByRole("button", { name: "Edit Tuesday: Closed" }));
    await user.click(await screen.findByRole("switch", { name: "Tuesday open" }));
    await user.keyboard("{Escape}");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Time off and extra hours" }));
    expect(screen.queryByRole("button", { name: /^Edit Tuesday: / })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Weekly hours" }));
    expect(screen.getByRole("button", { name: /^Edit Tuesday: 09:00/ })).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("lets staff edit their own calendar but only view others", async () => {
    nav.params = new URLSearchParams("r=r2");
    fakeResourcesApi({
      resources: [sam, jo],
      team: [...team, member({ id: "m3", userId: "u1", role: "staff" })],
    });
    renderDashboard(<ResourcesView />, "staff");

    expect(await screen.findByText(/View only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Closed days" })).not.toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Monday" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit Monday/ })).not.toBeInTheDocument();
  });

  it("shows staff their own calendar as editable", async () => {
    fakeResourcesApi({
      resources: [resource({ ...sam, memberId: "m3" })],
      team: [member({ id: "m3", userId: "u1", role: "staff" })],
    });
    renderDashboard(<ResourcesView />, "staff");
    expect(await screen.findByRole("button", { name: /^Edit Monday: / })).toBeEnabled();
    expect(screen.queryByText(/View only/)).not.toBeInTheDocument();
  });

  it("selects a newly added resource once saved", async () => {
    fakeResourcesApi({ resources: [sam], team });
    const user = userEvent.setup();
    renderDashboard(<ResourcesView />);
    await user.click(await screen.findByRole("button", { name: "Add therapist" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a therapist" });
    await user.type(within(dialog).getByRole("textbox", { name: /name/i }), "Jo Park");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/\?r=r-new-1$/), { scroll: false });
    expect(toast.success).toHaveBeenCalledWith("Jo Park added");
  });
});
