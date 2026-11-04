import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { MemberRole, SiteAiResult } from "@/lib/api/types";
import { json, renderDashboard, SITES_ON } from "../../test/render";
import { AiReviewCard } from "../ai-review-card";
import { SiteEditorPage } from "../site-editor";
import { SiteEditorProvider, type SiteEditor } from "../use-site-editor";
import { fakeSiteApi, SAMPLE_CREDITS, siteState, type FakeSite } from "./fake-site-api";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/site",
  useSearchParams: () => nav.params,
}));
vi.mock("@/components/ui/toast", () => ({ toast: toasts }));

let api: FakeSite;
beforeEach(() => {
  api = fakeSiteApi();
  toasts.success.mockReset();
  toasts.error.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const render = (tab: "ai" | "history" | "design", role: MemberRole = "owner") => {
  nav.params = new URLSearchParams(`tab=${tab}`);
  return renderDashboard(<SiteEditorPage />, role, SITES_ON);
};
const posts = (suffix: string) => api.calls.filter((c) => c.method === "POST" && c.path.endsWith(suffix));

describe("AI panel", () => {
  it("says the built-in designer is used, free, when no model is connected", async () => {
    render("ai");
    expect(
      await screen.findByText(/built-in designer is used instead: free and unlimited/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("generates after confirming, shows the changes and keeps them", async () => {
    const user = userEvent.setup();
    render("ai");
    await user.type(
      await screen.findByRole("textbox", { name: /What should it feel like/ }),
      "Bold and bright",
    );
    await user.click(screen.getByRole("button", { name: "Generate site" }));
    await user.click(await screen.findByRole("button", { name: "Generate" }));
    const review = await screen.findByRole("region", { name: "AI changes" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(review).getByText("Theme: Calm → Bold")).toBeInTheDocument();
    expect(within(review).getByText(/built-in designer/)).toBeInTheDocument();
    expect(posts("/site/generate")[0]?.body).toEqual({ prompt: "Bold and bright" });
    await user.click(within(review).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("region", { name: "AI changes" })).not.toBeInTheDocument();
    expect(api.state.draft.theme).toBe("bold");
  });

  it("applies an instruction and undoes it by restoring the previous version", async () => {
    const user = userEvent.setup();
    render("ai");
    await user.click(await screen.findByRole("button", { name: "Make it warmer" }));
    const review = await screen.findByRole("region", { name: "AI changes" });
    expect(posts("/site/edit")[0]?.body).toEqual({ instruction: "Make it warmer", baseVersion: 1 });
    expect(within(review).getByText("Theme: Calm → Playful")).toBeInTheDocument();

    await user.click(within(review).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(posts("/site/versions/1/restore")).toHaveLength(1));
    expect(api.state.draft.theme).toBe("calm");
    expect(toasts.success).toHaveBeenCalledWith("Change undone");
  });

  it("saves unsaved edits before asking the AI, so it sees the latest draft", async () => {
    const user = userEvent.setup();
    render("design");
    await user.click(await screen.findByRole("radio", { name: /Minimal/ }));
    await user.click(screen.getByRole("tab", { name: "AI" }));
    const box = await screen.findByRole("textbox", { name: /Your instruction/ });
    await user.type(box, "Move reviews higher{enter}");
    await waitFor(() => expect(posts("/site/edit")).toHaveLength(1));
    const order = api.calls
      .filter((c) => c.method !== "GET")
      .map((c) => `${c.method} ${c.path.split("/site").at(-1) || "/site"}`);
    expect(order.slice(0, 2)).toEqual(["PUT /site", "POST /edit"]);
    expect(posts("/site/edit")[0]?.body).toEqual({ instruction: "Move reviews higher", baseVersion: 2 });
  });

  it("shows a loading state while the AI works", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    render("ai");
    await screen.findByText("AI site builder");
    // The next edit hangs until released.
    api.fetch.mockImplementation(async (input) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path.endsWith("/site/edit")) {
        await pending;
        return json({
          state: api.state,
          source: "template",
          changes: [],
          previousVersion: 1,
          message: "Nothing to change.",
        });
      }
      if (path.endsWith("/site")) return json(api.state);
      if (path.endsWith("/versions")) return json({ items: [] });
      return json([]);
    });
    await user.click(screen.getByRole("button", { name: "Use the bold theme" }));
    const apply = screen.getByRole("button", { name: /Apply/ });
    await waitFor(() => expect(apply).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("button", { name: "Generate site" })).toBeDisabled();
    release();
    const review = await screen.findByRole("region", { name: "AI changes" });
    expect(within(review).getByText("Nothing changed")).toBeInTheDocument();
    expect(within(review).getByText("Nothing to change.")).toBeInTheDocument();
    expect(within(review).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("ignores Enter while the AI is still working on the last instruction", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    render("ai");
    const box = await screen.findByRole("textbox", { name: /Your instruction/ });
    const fake = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation(async (input, init) => {
      if (new URL(String(input), "http://x").pathname.endsWith("/site/edit")) await pending;
      return fake(input, init);
    });
    await user.type(box, "Add a parking FAQ{enter}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Apply/ })).toHaveAttribute("aria-busy", "true"),
    );
    await user.type(box, "{enter}");
    release();
    await screen.findByRole("region", { name: "AI changes" });
    expect(posts("/site/edit")).toHaveLength(1);
    expect(box).toHaveValue("");
  });

  it("keeps the other panels read-only while the AI works, so no edit is lost to its result", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    render("ai");
    await screen.findByText("AI site builder");
    const fake = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation(async (input, init) => {
      if (new URL(String(input), "http://x").pathname.endsWith("/site/edit")) await pending;
      return fake(input, init);
    });
    await user.click(screen.getByRole("button", { name: "Make it warmer" }));
    await user.click(screen.getByRole("tab", { name: "Design" }));
    expect(await screen.findByRole("status")).toHaveTextContent("The AI is changing your site.");
    expect(screen.getByRole("radio", { name: /Bold/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByRole("radio", { name: /Bold/ })).toBeEnabled());
    expect(screen.queryByText("The AI is changing your site.", { exact: false })).not.toBeInTheDocument();
  });

  it("asks before Undo throws away edits made after the AI's change", async () => {
    const user = userEvent.setup();
    const adopt = vi.fn();
    // The card with unsaved edits in the editor (the panel's own flow can't leave edits under an open card today).
    const editor = { site: api.state, plan: api.state.draft, dirty: true, adopt } as unknown as SiteEditor;
    const result: SiteAiResult = {
      state: api.state,
      source: "template",
      changes: ["Theme: Calm → Playful"],
      previousVersion: 1,
      message: null,
    };
    const onDone = vi.fn();
    renderDashboard(
      <SiteEditorProvider value={editor}>
        <AiReviewCard result={result} onDone={onDone} />
      </SiteEditorProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Undo" }));
    const ask = await screen.findByRole("alertdialog", { name: "Undo the AI's change?" });
    expect(ask).toHaveAccessibleDescription(/edits you've made since then will be lost/);
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(posts("/site/versions/1/restore")).toHaveLength(0);
    expect(adopt).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "Undo the AI's change?" })).getByRole("button", {
        name: "Undo",
      }),
    );
    await waitFor(() => expect(posts("/site/versions/1/restore")).toHaveLength(1));
    expect(adopt).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("keeps an instruction that failed, so it can be sent again", async () => {
    const user = userEvent.setup();
    api.nextAi = json({ error: { code: "RATE_LIMITED", message: "Too many requests.", fields: {} } }, 429);
    render("ai");
    const box = await screen.findByRole("textbox", { name: /Your instruction/ });
    await user.type(box, "Add a parking FAQ{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work");
    expect(box).toHaveValue("Add a parking FAQ");
  });

  it("explains the monthly limit and links owners to plans", async () => {
    const user = userEvent.setup();
    api.nextAi = json(
      {
        error: {
          code: "AI_LIMIT_REACHED",
          message: "You've used all 100 AI credits on the Free plan this month.",
          fields: {},
        },
      },
      409,
    );
    render("ai");
    await user.click(await screen.findByRole("button", { name: "Make it warmer" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You've used this month's AI credits");
    expect(alert).toHaveTextContent("You've used all 100 AI credits on the Free plan this month.");
    expect(within(alert).getByRole("link", { name: "See plans" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/billing",
    );
  });

  it("hides the plans link from admins (billing is owner-only)", async () => {
    const user = userEvent.setup();
    api.nextAi = json({ error: { code: "AI_LIMIT_REACHED", message: "Limit.", fields: {} } }, 409);
    render("ai", "admin");
    await user.click(await screen.findByRole("button", { name: "Make it warmer" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See plans" })).not.toBeInTheDocument();
  });

  it("shows other errors", async () => {
    const user = userEvent.setup();
    api.nextAi = json({ error: { code: "RATE_LIMITED", message: "Too many requests.", fields: {} } }, 429);
    render("ai");
    await user.click(await screen.findByRole("button", { name: "Make it warmer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work");
  });

  it("shows the credits meter and disables AI actions when the credits are used up", async () => {
    api.state = siteState({
      ai: {
        model: true,
        credits: { ...SAMPLE_CREDITS, used: 100, remaining: 0, runningLow: true, limitReached: true },
      },
    });
    render("ai");
    expect(await screen.findByRole("button", { name: "Generate site" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Make it warmer" })).toBeDisabled();
    expect(screen.queryByText(/built-in designer is used instead/)).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "AI credits this month" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "This month's AI credits are used up. They reset on Sun, 1 Nov.",
    );
  });

  it("warns when credits are running low, but keeps AI available", async () => {
    api.state = siteState({
      ai: { model: true, credits: { ...SAMPLE_CREDITS, used: 70, remaining: 30, runningLow: true } },
    });
    render("ai");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Running low on AI credits: 30 left until Sun, 1 Nov. See usage",
    );
    expect(screen.getByRole("button", { name: "Generate site" })).toBeEnabled();
  });
});

describe("history", () => {
  it("lists versions with live and draft markers and restores one after confirming", async () => {
    const user = userEvent.setup();
    api.versions.push({
      ...must(api.versions[0], "the seed version"),
      version: 2,
      source: "owner",
      plan: { ...api.state.draft, theme: "bold" },
    });
    api.state = { ...api.state, draftVersion: 2, hasUnpublishedChanges: true };
    render("history");
    const items = within(await screen.findByRole("list", { name: "Versions" })).getAllByRole("listitem");
    const [latest, live] = [must(items[0], "version 2"), must(items[1], "version 1")];
    expect(latest).toHaveTextContent("Version 2");
    expect(latest).toHaveTextContent("Draft");
    expect(live).toHaveTextContent("Version 1");
    expect(live).toHaveTextContent("Live");
    expect(within(latest).queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();

    await user.click(within(live).getByRole("button", { name: "Restore version 1" }));
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(posts("/site/versions/1/restore")).toHaveLength(1));
    expect(api.state.draft.theme).toBe("calm");
    expect(toasts.success).toHaveBeenCalledWith("Version 1 restored to your draft");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("shows an empty state", async () => {
    api.versions = [];
    render("history");
    expect(await screen.findByText("No versions yet")).toBeInTheDocument();
  });
});
