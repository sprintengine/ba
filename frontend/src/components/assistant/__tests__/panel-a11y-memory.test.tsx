/** Bo's panel: axe on home, chat and memory; memory entries edited and forgotten (keyboard included). */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryEntry } from "@/lib/api/types";
import { json, renderDashboard } from "@/components/dashboard/test/render";
import { expectNoAxeViolations } from "@/test/axe";
import { AssistantProvider } from "../assistant-context";
import { AssistantPanel } from "../assistant-panel";
import { BoLauncher } from "../bo-launcher";
import { credits, fakeAssistantApi, nudge, proposal, reply, Turn } from "./fake-assistant-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

let api: ReturnType<typeof fakeAssistantApi>;
beforeEach(() => {
  api = fakeAssistantApi();
  toast.error.mockReset();
});

const memory = (id: string, text: string): MemoryEntry => ({
  id,
  text,
  createdBy: "Avery Morgan",
  createdAt: "",
  updatedAt: "",
});

async function openBo(role: "owner" | "staff" = "owner") {
  const user = userEvent.setup();
  renderDashboard(
    <AssistantProvider>
      <BoLauncher />
      <AssistantPanel />
    </AssistantProvider>,
    role,
  );
  await user.click(await screen.findByRole("button", { name: /^Open Bo/ }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

async function openMemory() {
  const opened = await openBo();
  await opened.user.click(within(opened.dialog).getByRole("button", { name: "Memory" }));
  const list = await screen.findByRole("list", { name: "What Bo remembers" });
  return { ...opened, list };
}

describe("Bo's panel is axe-clean", () => {
  it("on the home view, with nudges and low credits", async () => {
    api.state = {
      ...api.state,
      nudges: [nudge()],
      credits: credits({ used: 1300, remaining: 200, runningLow: true }),
    };
    const { dialog } = await openBo();
    expect(within(dialog).getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations(document.body);
  });

  it("in a conversation with a proposal", async () => {
    const turn = new Turn();
    api.next = turn;
    const { user } = await openBo();
    await user.type(screen.getByRole("textbox", { name: "Message Bo" }), "Book Robin in tomorrow{Enter}");
    act(() =>
      turn.end(
        { type: "proposal", action: proposal() },
        {
          type: "done",
          message: reply({
            text: "Here's the plan:\n\n- **Robin** at 10:00\n- Alex as therapist",
            actions: [proposal()],
          }),
          credits: credits(),
        },
      ),
    );
    expect(await screen.findByRole("region", { name: "New booking" })).toBeInTheDocument();
    expect(within(screen.getByRole("log")).getByText("Robin")).toHaveProperty("tagName", "STRONG");
    await expectNoAxeViolations(document.body);
  });

  it("on the memory view", async () => {
    api.memory = [memory("m1", "We close early on Fridays")];
    await openMemory();
    await expectNoAxeViolations(document.body);
  });

  it("while memory loads and when it fails", async () => {
    api.fetch.mockImplementation(async (input) =>
      String(input).includes("/assistant/memory")
        ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Memory is unavailable" } }, 500)
        : json(api.state),
    );
    const { user, dialog } = await openBo();
    await user.click(within(dialog).getByRole("button", { name: "Memory" }));
    expect(await within(dialog).findByText("Memory is unavailable")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /try again/i })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });
});

describe("Memory entries", () => {
  it("edits an entry; Enter saves and focus returns to its Edit button", async () => {
    api.memory = [memory("m1", "We close early on Fridays"), memory("m2", "Parking at the back")];
    const { user, list } = await openMemory();

    await user.click(within(list).getByRole("button", { name: "Edit: We close early on Fridays" }));
    const box = within(list).getByRole("textbox", { name: "Edit memory" });
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute("maxLength", "280");
    await user.clear(box);
    expect(within(list).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(box, "We close at 4 on Fridays{Enter}");

    expect(await within(list).findByText("We close at 4 on Fridays")).toBeInTheDocument();
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: "PATCH", body: { text: "We close at 4 on Fridays" } }),
    );
    await waitFor(() =>
      expect(within(list).getByRole("button", { name: "Edit: We close at 4 on Fridays" })).toHaveFocus(),
    );
  });

  it("cancels an edit without saving", async () => {
    api.memory = [memory("m1", "We close early on Fridays")];
    const { user, list } = await openMemory();
    await user.click(within(list).getByRole("button", { name: "Edit: We close early on Fridays" }));
    await user.type(within(list).getByRole("textbox", { name: "Edit memory" }), " and Saturdays");
    await user.click(within(list).getByRole("button", { name: "Cancel" }));

    expect(within(list).getByText("We close early on Fridays")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Edit: We close early on Fridays" })).toHaveFocus();
    expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("keeps the edit open and says why when saving fails", async () => {
    api.memory = [memory("m1", "We close early on Fridays")];
    const { user, list } = await openMemory();
    api.nextMemoryEditResponse = json(
      { error: { code: "INVALID_REQUEST", message: "Contains invalid characters", fields: {} } },
      400,
    );
    await user.click(within(list).getByRole("button", { name: "Edit: We close early on Fridays" }));
    await user.click(within(list).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Contains invalid characters"));
    expect(within(list).getByRole("textbox", { name: "Edit memory" })).toBeInTheDocument();
  });

  it("forgets an entry, and says so when that fails", async () => {
    api.memory = [memory("m1", "We close early on Fridays"), memory("m2", "Parking at the back")];
    const { user, list } = await openMemory();

    await user.click(within(list).getByRole("button", { name: "Forget: Parking at the back" }));
    await waitFor(() => expect(within(list).queryByText("Parking at the back")).not.toBeInTheDocument());
    expect(api.calls).toContainEqual(expect.objectContaining({ method: "DELETE" }));

    api.nextMemoryEditResponse = json(
      { error: { code: "FORBIDDEN", message: "Only admins can do that" } },
      403,
    );
    await user.click(within(list).getByRole("button", { name: "Forget: We close early on Fridays" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only admins can do that"));
    expect(within(list).getByText("We close early on Fridays")).toBeInTheDocument();
  });

  it("explains to staff that owners and admins edit", async () => {
    api.memory = [memory("m1", "We close early on Fridays")];
    const { user, dialog } = await openBo("staff");
    await user.click(within(dialog).getByRole("button", { name: "Memory" }));
    expect(await within(dialog).findByText(/Owners and admins can change them/)).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });
});
