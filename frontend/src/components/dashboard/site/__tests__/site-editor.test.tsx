import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { MemberRole, SitePlan } from "@/lib/api/types";
import { renderDashboard, SITES_ON } from "../../test/render";
import { SiteEditorPage } from "../site-editor";
import { fakeSiteApi, siteState, type FakeSite } from "./fake-site-api";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: toasts }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/dashboard/lumen-physio/site",
  useSearchParams: () => nav.params,
}));

let api: FakeSite;
beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  toasts.success.mockReset();
  toasts.error.mockReset();
  api = fakeSiteApi();
});
afterEach(() => vi.unstubAllGlobals());

const renderEditor = (role: MemberRole = "owner") => renderDashboard(<SiteEditorPage />, role, SITES_ON);
const saves = () =>
  api.calls.filter((c) => c.method === "PUT").map((c) => (c.body as { plan: SitePlan }).plan);
const openTab = (tab: string) => (nav.params = new URLSearchParams(`tab=${tab}`));

describe("site editor: access", () => {
  it.each<[MemberRole, boolean]>([
    ["owner", true],
    ["admin", true],
    ["staff", false],
  ])("%s %s", async (role, allowed) => {
    renderEditor(role);
    if (allowed) {
      expect(await screen.findByRole("heading", { name: "Site" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Design" })).toBeInTheDocument();
    } else {
      expect(screen.getByText("The site is edited by owners and admins")).toBeInTheDocument();
      expect(api.calls.some((c) => c.path.endsWith("/site"))).toBe(false);
    }
  });
});

describe("site editor: business websites off", () => {
  it("points to Branding instead, without asking for the site", () => {
    renderDashboard(<SiteEditorPage />);
    expect(screen.getByText("Your booking page is set up in Branding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Branding" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/branding",
    );
    expect(api.calls.some((c) => c.path.endsWith("/site"))).toBe(false);
  });
});

describe("site editor: design, save and publish", () => {
  it("shows the published status, then unsaved changes after picking a theme; Save sends the plan", async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(await screen.findByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Bold/ }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]?.theme).toBe("bold");
    expect(api.calls.find((c) => c.method === "PUT")!.body).toMatchObject({ baseVersion: 1 });
    expect(await screen.findByText("Draft not published")).toBeInTheDocument();
  });

  it("Publish saves pending changes first, then publishes", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("radio", { name: /Editorial/ }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/site/publish"))).toBe(true));
    const order = api.calls
      .filter((c) => c.method !== "GET")
      .map((c) => c.path.split("/site").at(-1) || "PUT");
    expect(order).toEqual(["PUT", "/publish"]);
    expect(api.state.published?.theme).toBe("editorial");
    expect(await screen.findByText("Published")).toBeInTheDocument();
  });

  it("sends one save at a time, and holds Publish while it runs", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    const fake = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation(async (input, init) => {
      if (init?.method === "PUT") await pending;
      return fake(input, init);
    });
    renderEditor();
    await user.click(await screen.findByRole("radio", { name: /Bold/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.keyboard("{Meta>}s{/Meta}");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    release();
    await waitFor(() => expect(toasts.success).toHaveBeenCalledTimes(2));
    expect(saves()).toHaveLength(1);
    expect(toasts.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("after a conflict, loads the other draft and the next save goes on top of it", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("radio", { name: /Bold/ }));
    // Someone else saved version 2 meanwhile.
    api.state = { ...api.state, draftVersion: 2 };
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("Save again to keep your changes")),
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === "GET" && c.path.endsWith("/site"))).toHaveLength(2),
    );

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Draft saved"));
    const puts = api.calls.filter((c) => c.method === "PUT").map((c) => c.body);
    expect(puts).toMatchObject([{ baseVersion: 1 }, { baseVersion: 2 }]);
    expect(api.state.draft.theme).toBe("bold");
  });

  it("has the browser ask before leaving with unsaved changes, until they're saved", async () => {
    const user = userEvent.setup();
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    renderEditor();
    await user.click(await screen.findByRole("radio", { name: /Bold/ }));
    expect(leave()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    expect(leave()).toBe(false);
  });

  it("Discard returns to the saved draft", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("radio", { name: /Playful/ }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("radio", { name: /Calm/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("blocks saving a palette that fails contrast", async () => {
    const user = userEvent.setup();
    renderEditor();
    const hex = await screen.findByRole("textbox", { name: /hex/i });
    await user.clear(hex);
    await user.type(hex, "#ffff00{enter}");
    expect(await screen.findByText(/Too light for buttons/)).toBeInTheDocument();
    expect(screen.getByText("1 to fix")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("offers a draft preview link once a draft exists, and a published view", async () => {
    renderEditor();
    expect(await screen.findByRole("link", { name: /View site/ })).toHaveAttribute("href", "/lumen-physio");
    expect(screen.getByRole("link", { name: /Preview draft/ })).toHaveAttribute(
      "href",
      "/lumen-physio?site=draft",
    );
  });
});

describe("site editor: sections", () => {
  beforeEach(() => openTab("sections"));

  it("lists sections in order and reorders with the menu", async () => {
    const user = userEvent.setup();
    renderEditor();
    const list = await screen.findByRole("list", { name: "Sections" });
    const labels = () =>
      within(list)
        .getAllByRole("button", {
          name: /^(Hero|Services|About|Team|Testimonials|FAQ|Hours & location|Gallery|Call to action|Contact)/,
        })
        .map((b) => b.textContent);
    expect(labels()[0]).toMatch(/^Hero/);
    await user.click(within(list).getByRole("button", { name: "FAQ options" }));
    await user.click(screen.getByRole("menuitem", { name: /Move up/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]?.sections.map((s) => s.id)).toEqual([
      "hero",
      "services",
      "about",
      "team",
      "faq",
      "testimonials",
      "hours",
      "gallery",
      "cta",
      "contact",
    ]);
  });

  it("hides and shows a section", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("switch", { name: "Hide Testimonials" }));
    expect(screen.getByRole("switch", { name: "Show Testimonials" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]?.sections.find((s) => s.id === "testimonials")?.enabled).toBe(false);
  });

  it("edits content live and validates it with the section schema", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: /^Hero(?! options)/, expanded: false }));
    const headline = screen.getByRole("textbox", { name: /Headline/ });
    await user.clear(headline);
    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(screen.getAllByText("1 to fix")).toHaveLength(2); // page header and the section row
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();

    await user.type(headline, "A".repeat(91));
    expect(await screen.findByText("Headline can be at most 90 characters")).toBeInTheDocument();
    await user.clear(headline);
    await user.type(headline, "New headline");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    // The live preview follows.
    expect(within(screen.getByTestId("site-preview")).getByRole("heading", { level: 1 })).toHaveTextContent(
      "New headline",
    );

    await user.clear(screen.getByRole("textbox", { name: /Eyebrow/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    const hero = must(saves()[0]?.sections[0], "the saved hero");
    expect(hero.content).toMatchObject({ headline: "New headline", eyebrow: null });
  });

  it("adds FAQ questions with the list editor", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: /^FAQ(?! options)/, expanded: false }));
    await user.click(screen.getByRole("button", { name: "Add question" }));
    await user.type(screen.getAllByRole("textbox", { name: /^Question/ }).at(-1)!, "Is there parking?");
    await user.type(screen.getAllByRole("textbox", { name: /^Answer/ }).at(-1)!, "Yes, behind the building.");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    const faq = must(
      saves()[0]?.sections.find((s) => s.id === "faq"),
      "the saved FAQ",
    );
    expect(faq.content).toMatchObject({
      items: expect.arrayContaining([{ question: "Is there parking?", answer: "Yes, behind the building." }]),
    });
  });

  it("adds a section from the menu and blocks a second hero", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    expect(screen.getByRole("menuitem", { name: /Hero/ })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitem", { name: /^Call to action/ }));
    expect(await screen.findByText("11/16 sections")).toBeInTheDocument();
  });

  it("removes a section after confirming", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Gallery options" }));
    await user.click(screen.getByRole("menuitem", { name: /Remove section/ }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByText("9/16 sections")).toBeInTheDocument();
  });

  it("selects a section by clicking it in the preview", async () => {
    const user = userEvent.setup();
    renderEditor();
    const preview = await screen.findByTestId("site-preview");
    await user.click(within(preview).getByRole("heading", { name: "Questions and answers" }));
    expect(screen.getByRole("button", { name: /^FAQ(?! options)/, expanded: true })).toBeInTheDocument();
  });

  it("reports a conflict when the draft changed elsewhere", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("switch", { name: "Hide FAQ" }));
    api.state = { ...api.state, draftVersion: 7 };
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        "The site was changed elsewhere. Save again to keep your changes, or discard them to see the latest draft.",
      ),
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});

describe("site editor: editing while a save is in flight", () => {
  beforeEach(() => openTab("sections"));

  it("keeps what was typed while the draft was saving", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const fakeFetch = api.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") await held;
      return fakeFetch(input, init);
    });
    renderEditor();
    await user.click(await screen.findByRole("button", { name: /^Hero(?! options)/, expanded: false }));
    const headline = () => screen.getByRole("textbox", { name: /Headline/ });
    await user.clear(headline());
    await user.type(headline(), "First");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    // The request is held; the owner carries on typing.
    await user.type(headline(), " and more");
    release();
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Draft saved"));
    expect(saves().at(0)?.sections[0]?.content).toMatchObject({ headline: "First" });
    await waitFor(() => expect(headline()).toHaveValue("First and more"));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});

describe("site editor: loading states", () => {
  it("shows a skeleton, then the editor", async () => {
    renderEditor();
    expect(screen.getByLabelText("Loading site editor")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Site" })).toBeInTheDocument();
  });

  it("starts from the default plan when nothing was saved yet", async () => {
    api.state = siteState({ draftVersion: null, published: null, publishedVersion: null, publishedAt: null });
    renderEditor();
    expect(await screen.findByText("Draft not published")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Preview draft/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });
});
