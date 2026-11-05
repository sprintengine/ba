import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, MemberRole } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { RescheduleDialog } from "../booking/reschedule-dialog";
import { availability, requestBody, requestUrl, slot } from "./booking-builders";
import { booking, json, mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockClear();
  toast.error.mockClear();
});

const DAY = "2099-10-01";
const CURRENT = `${DAY}T09:00:00+01:00`;
const free = availability({
  [DAY]: [
    slot(CURRENT),
    slot(`${DAY}T11:00:00+01:00`, { resourceIds: ["r2"] }),
    slot(`${DAY}T14:00:00+01:00`),
  ],
});

function api(reschedule: (body: unknown) => unknown = (body) => booking(body as Partial<Booking>)) {
  return mockApi((method, path, body) => {
    if (path.endsWith("/availability")) return free;
    if (path.endsWith("/reschedule")) return reschedule(body);
    return {};
  });
}

function renderDialog(
  patch: Partial<Booking> = {},
  role: MemberRole = "owner",
  onOpenChange: (open: boolean) => void = () => {},
) {
  return renderDashboard(
    <RescheduleDialog booking={booking(patch)} open onOpenChange={onOpenChange} />,
    role,
  );
}

const availabilityQuery = (calls: ReturnType<typeof mockApi>) =>
  calls.mock.calls
    .map(([u]) => new URL(String(u), "http://x"))
    .filter((u) => u.pathname.endsWith("/availability"))
    .map((u) => Object.fromEntries(u.searchParams));

describe("RescheduleDialog", () => {
  it("moves to a free time with the same calendar, never offering the booking's own time", async () => {
    const onOpenChange = vi.fn();
    const calls = api();
    const user = userEvent.setup();
    renderDialog({}, "owner", onOpenChange);

    expect(screen.getByRole("dialog", { name: "Reschedule" })).toHaveTextContent(
      /Alex Morgan · Follow-up · currently .*1 Oct, 09:00/,
    );
    await screen.findByRole("radio", { name: "11:00" });
    expect(screen.queryByRole("radio", { name: "09:00" })).not.toBeInTheDocument();
    expect(availabilityQuery(calls)[0]).toMatchObject({
      serviceId: "s1",
      resourceId: "r1",
      excludeBookingId: "bk1",
      from: DAY,
    });
    expect(screen.getByRole("button", { name: "Pick a time" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "11:00" }));
    await user.click(screen.getByRole("button", { name: "Move to 11:00" }));
    await waitFor(() =>
      expect(requestBody(calls, "/reschedule")).toEqual({
        start: `${DAY}T11:00:00+01:00`,
        resourceIds: ["r2"],
        notifyCustomer: true,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Moved to .*1 Oct, 11:00$/));
  });

  it("searches every calendar for “any available” and lets the server keep staff on their own", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderDialog({}, "staff");
    await screen.findByRole("radio", { name: "11:00" });

    await user.click(screen.getByRole("combobox", { name: "With" }));
    await user.click(await screen.findByRole("option", { name: "Any available therapist" }));
    await waitFor(() => expect(availabilityQuery(calls).some((q) => !("resourceId" in q))).toBe(true));

    await user.click(await screen.findByRole("button", { name: /^Afternoon/ }));
    await user.click(await screen.findByRole("radio", { name: "14:00" }));
    await user.click(screen.getByRole("button", { name: "Move to 14:00" }));
    await waitFor(() =>
      expect(requestBody(calls, "/reschedule")).toEqual({
        start: `${DAY}T14:00:00+01:00`,
        resourceIds: null,
        notifyCustomer: true,
      }),
    );
  });

  it("moves to an exact time with the same calendar, without emailing the customer", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("radio", { name: "Exact time" }));
    await user.type(screen.getByRole("textbox", { name: "Start time" }), "1430");
    await user.tab();
    await user.click(screen.getByRole("switch", { name: "Email the patient" }));
    await user.click(screen.getByRole("button", { name: "Move to 14:30" }));
    await waitFor(() =>
      expect(requestBody(calls, "/reschedule")).toEqual({
        start: `${DAY}T14:30:00+01:00`,
        resourceIds: ["r1"],
        notifyCustomer: false,
      }),
    );
  });

  it("leaves the calendar to the server at an exact time with “any available”", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("combobox", { name: "With" }));
    await user.click(await screen.findByRole("option", { name: "Any available therapist" }));
    await user.click(screen.getByRole("radio", { name: "Exact time" }));
    await user.type(screen.getByRole("textbox", { name: "Start time" }), "1430");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Move to 14:30" }));
    await waitFor(() =>
      expect(requestBody(calls, "/reschedule")).toMatchObject({
        start: `${DAY}T14:30:00+01:00`,
        resourceIds: null,
      }),
    );
  });

  it("asks for another time when the chosen one was just taken", async () => {
    api(() => json({ error: { code: "SLOT_UNAVAILABLE", message: "Taken" } }, 409));
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("radio", { name: "11:00" }));
    await user.click(screen.getByRole("button", { name: "Move to 11:00" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That time was just taken. Pick another one."),
    );
    expect(screen.getByRole("button", { name: "Pick a time" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "11:00" })).toHaveAttribute("aria-checked", "false");
  });

  it("shows the server's message for other failures and stays open", async () => {
    const onOpenChange = vi.fn();
    api(() => json({ error: { code: "POLICY_VIOLATION", message: "Too close to the start" } }, 422));
    const user = userEvent.setup();
    renderDialog({}, "owner", onOpenChange);
    await user.click(await screen.findByRole("radio", { name: "11:00" }));
    await user.click(screen.getByRole("button", { name: "Move to 11:00" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Too close to the start"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("starts from today for a booking in the past, and has no “With” for a booking without resources", async () => {
    const calls = api();
    renderDialog({ start: "2099-09-01T09:00:00+01:00", end: "2099-09-01T09:45:00+01:00", resources: [] });
    await waitFor(() => expect(availabilityQuery(calls)[0]).toMatchObject({ from: "2099-09-20" }));
    expect(availabilityQuery(calls)[0]).not.toHaveProperty("resourceId");
    expect(screen.queryByRole("combobox", { name: "With" })).not.toBeInTheDocument();
  });

  it("is accessible and closes on Escape or Cancel", async () => {
    const onOpenChange = vi.fn();
    api();
    const user = userEvent.setup();
    renderDialog({}, "owner", onOpenChange);
    await screen.findByRole("radio", { name: "11:00" });
    await expectNoAxeViolations(document.body);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("starts afresh when opened again after a move, never offering the move just made", async () => {
    const calls = api();
    const user = userEvent.setup();
    function Reopenable() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reschedule again
          </button>
          <RescheduleDialog booking={booking()} open={open} onOpenChange={setOpen} />
        </>
      );
    }
    renderDashboard(<Reopenable />);
    await user.click(await screen.findByRole("radio", { name: "11:00" }));
    await user.click(screen.getByRole("button", { name: "Move to 11:00" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Reschedule again" }));
    await screen.findByRole("dialog", { name: "Reschedule" });
    expect(screen.getByRole("button", { name: "Pick a time" })).toBeDisabled();
    expect(calls.mock.calls.filter(([u]) => String(u).endsWith("/reschedule"))).toHaveLength(1);
  });

  it("clears the chosen time when the date changes", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("radio", { name: "11:00" }));
    expect(screen.getByRole("button", { name: "Move to 11:00" })).toBeEnabled();
    // The date field opens a month calendar.
    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(await screen.findByRole("button", { name: /\b2 October 2099/ }));
    await waitFor(() => expect(availabilityQuery(calls).some((q) => q.from === "2099-10-02")).toBe(true));
    expect(screen.getByRole("button", { name: "Pick a time" })).toBeDisabled();
    expect(requestUrl(calls, "/reschedule", "POST")).toBeUndefined();
  });
});
