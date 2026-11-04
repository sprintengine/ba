/** The site editor's section forms (services, team, about, gallery, testimonials, hours, contact) and axe passes. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionContentMap, SitePlan, SiteSectionType } from "@/lib/api/types";
import { samplePlan } from "@/components/site/sample-site";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { renderDashboard, SITES_ON } from "../../test/render";
import { SiteEditorPage } from "../site-editor";
import { fakeSiteApi, siteState, type FakeSite } from "./fake-site-api";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: toasts }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/site",
  useSearchParams: () => nav.params,
}));

let api: FakeSite;
beforeEach(() => {
  nav.params = new URLSearchParams("tab=sections");
  api = fakeSiteApi();
});
afterEach(() => vi.unstubAllGlobals());

type User = ReturnType<typeof userEvent.setup>;

/** Expands the section row named [name] and returns its form. */
async function openSection(user: User, name: string) {
  const toggle = await screen.findByRole("button", {
    name: new RegExp(`^${name}(?! options)`),
    expanded: false,
  });
  await user.click(toggle);
  return within(must(document.getElementById(must(toggle.getAttribute("aria-controls"), "form id")), "form"));
}

/** Saves the draft and returns the content of section [id] as saved. */
async function saveSection<T extends SiteSectionType>(user: User, id: string, _type: T) {
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.calls.some((c) => c.method === "PUT")).toBe(true));
  const plan = must(api.calls.filter((c) => c.method === "PUT").at(-1), "a save").body as { plan: SitePlan };
  return must(
    plan.plan.sections.find((s) => s.id === id),
    `saved ${id}`,
  ).content as SectionContentMap[T];
}

/** Replaces [el]'s text in one paste: typing re-renders the whole live preview on every keystroke. */
async function fill(user: User, el: HTMLElement, text: string) {
  await user.clear(el);
  await user.click(el);
  await user.paste(text);
}

function renderEditor() {
  return renderDashboard(<SiteEditorPage />, "owner", SITES_ON);
}

describe("Site editor accessibility", () => {
  // One axe run per test: the editor (with its live preview) is a big tree.
  it("is axe-clean on the design tab", async () => {
    nav.params = new URLSearchParams();
    const { container } = renderEditor();
    expect(await screen.findByRole("tab", { name: "Design" })).toHaveAttribute("aria-selected", "true");
    await expectNoAxeViolations(container);
  });

  it("is axe-clean with a list form open", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    await openSection(user, "Testimonials");
    await expectNoAxeViolations(container);
  });

  it("is axe-clean with the about form open", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    await openSection(user, "About");
    await expectNoAxeViolations(container);
  });

  it("is axe-clean with the team form listing people", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    const team = await openSection(user, "Team");
    await user.click(team.getByRole("switch", { name: /show everyone/i }));
    await expectNoAxeViolations(container);
  });
});

describe("Design panel", () => {
  it("adds a second colour and checks the search title's length", async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams();
    renderEditor();
    const second = await screen.findByRole("switch", { name: /second colour/i });
    expect(screen.queryByText("Accent colour")).not.toBeInTheDocument();
    await user.click(second);
    expect(second).toBeChecked();
    expect(screen.getByText("Accent colour")).toBeInTheDocument();

    const title = screen.getByRole("textbox", { name: /page title/i });
    await fill(user, title, "x".repeat(71));
    await waitFor(() => expect(title).toHaveAttribute("aria-invalid", "true"));
    expect(title).toHaveAccessibleDescription(/Title can be at most 70 characters/);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    const description = screen.getByRole("textbox", { name: /^Description/ });
    await fill(user, description, "Physio in Dublin 2.");
    expect(description).toHaveAccessibleDescription("19/160");
    await fill(user, title, "Harbour Lane Physio");
    await waitFor(() => expect(title).not.toHaveAttribute("aria-invalid"));

    await user.click(second);
    expect(screen.queryByText("Accent colour")).not.toBeInTheDocument();
  });
});

describe("Services form", () => {
  it("shows a chosen subset of services and hides prices", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Services");
    expect(form.getByRole("textbox", { name: "Heading" })).toHaveAccessibleDescription("8/80");

    const all = form.getByRole("switch", { name: /show all public services/i });
    expect(all).toBeChecked();
    await user.click(all);
    const boxes = await form.findAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(1);
    boxes.forEach((b) => expect(b).toBeChecked());
    await user.click(must(boxes[0], "first service"));
    expect(boxes[0]).not.toBeChecked();
    await user.click(form.getByRole("switch", { name: "Show prices" }));

    const saved = await saveSection(user, "services", "services");
    expect(saved.serviceIds).toHaveLength(boxes.length - 1);
    expect(saved.showPrices).toBe(false);
  });

  it("goes back to all services when every one is ticked again", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Services");
    await user.click(form.getByRole("switch", { name: /show all public services/i }));
    const [first] = await form.findAllByRole("checkbox");
    await user.click(must(first, "first service"));
    await user.click(must(first, "first service"));
    expect(form.getByRole("switch", { name: /show all public services/i })).toBeChecked();
  });
});

describe("Team form", () => {
  it("picks people with their own bio, flagging one that is too long", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Team");
    const everyone = form.getByRole("switch", { name: /show everyone/i });
    expect(everyone).toBeChecked();
    await user.click(everyone);

    expect(form.getByRole("checkbox", { name: "Robin Vale" })).toBeChecked();
    await user.click(form.getByRole("checkbox", { name: "Jules Moreno" }));
    expect(form.getAllByRole("textbox", { name: /^Bio/ })).toHaveLength(2);

    const bio = must(form.getAllByRole("textbox", { name: /^Bio/ })[0], "Robin's bio");
    await user.clear(bio);
    await fill(user, bio, "x".repeat(401));
    await waitFor(() => expect(bio).toHaveAttribute("aria-invalid", "true"));
    expect(bio).toHaveAccessibleDescription(/at most 400 characters/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await user.clear(bio);
    await fill(user, bio, "Ten years of sports physio.");

    const saved = await saveSection(user, "team", "team");
    expect(saved.members.map((m) => m.resourceId)).toEqual(["res-1", "res-2"]);
    expect(saved.members[0]?.bio).toBe("Ten years of sports physio.");

    await user.click(form.getByRole("checkbox", { name: "Robin Vale" }));
    await user.click(form.getByRole("checkbox", { name: "Robin Vale" }));
    await user.click(form.getByRole("switch", { name: /show everyone/i }));
    expect(form.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("explains where people come from when there are none", async () => {
    const user = userEvent.setup();
    api.state = siteState({ context: { ...api.state.context, team: [] } });
    renderEditor();
    const form = await openSection(user, "Team");
    expect(form.getByText(/Add people under Resources/)).toBeInTheDocument();
  });
});

describe("About form", () => {
  it("edits the text and highlights, one per line", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "About");
    const highlights = form.getByRole("textbox", { name: /highlights/i });
    expect(highlights).toHaveValue(
      "Evening appointments\nOnline booking any time\nStep-free access\nCard payments",
    );
    await user.clear(highlights);
    await fill(user, highlights, "Free parking\n\n  Wheelchair access  ");

    const text = form.getByRole("textbox", { name: /^Text/ });
    await user.clear(text);
    await waitFor(() => expect(text).toHaveAttribute("aria-invalid", "true"));
    expect(text).toHaveAccessibleDescription(/Required/);
    await fill(user, text, "Small, friendly and on time.");

    const saved = await saveSection(user, "about", "about");
    expect(saved.highlights).toEqual(["Free parking", "Wheelchair access"]);
    expect(saved.body).toBe("Small, friendly and on time.");
  });

  it("adds an image through the picker dialog, which closes on Escape", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "About");
    await user.click(form.getByRole("button", { name: "Add image" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Testimonials form (list field)", () => {
  it("adds, reorders and removes items with named buttons and validates them", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Testimonials");
    const list = form.getByRole("group", { name: /Testimonials/ });
    expect(list).toHaveTextContent("2/8");
    expect(form.getByRole("button", { name: "Move testimonial 1 up" })).toBeDisabled();
    expect(form.getByRole("button", { name: "Move testimonial 2 down" })).toBeDisabled();

    await user.click(form.getByRole("button", { name: "Add testimonial" }));
    expect(list).toHaveTextContent("3/8");
    const quote = must(form.getAllByRole("textbox", { name: /^Quote/ })[2], "third quote");
    await fill(user, quote, "Lovely people.");
    const author = must(form.getAllByRole("textbox", { name: /^Name/ })[2], "third author");
    await user.type(author, "x");
    await user.clear(author);
    await waitFor(() => expect(author).toHaveAttribute("aria-invalid", "true"));
    await fill(user, author, "Aoife");

    await user.click(form.getByRole("button", { name: "Move testimonial 3 up" }));
    expect(form.getAllByRole("textbox", { name: /^Quote/ })[1]).toHaveValue("Lovely people.");
    await user.click(form.getByRole("button", { name: "Remove testimonial 1" }));

    const saved = await saveSection(user, "testimonials", "testimonials");
    expect(saved.items.map((i) => i.quote)).toEqual([
      "Lovely people.",
      "Clear, kind and on time. I'll be back.",
    ]);
    expect(saved.items[0]).toMatchObject({ author: "Aoife", detail: null });
  });

  it("explains that the section stays hidden while empty", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Testimonials");
    await user.click(form.getByRole("button", { name: "Remove testimonial 2" }));
    await user.click(form.getByRole("button", { name: "Remove testimonial 1" }));
    expect(form.getByText(/stays hidden on your site until you add one/)).toBeInTheDocument();
  });
});

describe("Gallery form", () => {
  it("lists photos with a remove button each and opens the picker", async () => {
    const user = userEvent.setup();
    const plan = samplePlan("calm");
    const image = {
      kind: "upload" as const,
      url: "https://cdn.example.test/a.png",
      alt: "Treatment room",
      pattern: null,
      attribution: null,
    };
    const withPhotos: SitePlan = {
      ...plan,
      sections: plan.sections.map((s) =>
        s.type === "gallery"
          ? { ...s, enabled: true, content: { heading: "Gallery", images: [image, image] } }
          : s,
      ),
    };
    api.state = siteState({ draft: withPhotos });
    renderEditor();
    const form = await openSection(user, "Gallery");
    expect(form.getByRole("group", { name: /Photos/ })).toHaveTextContent("2/12");

    await user.click(form.getByRole("button", { name: "Remove photo 2" }));
    expect(form.getByRole("group", { name: /Photos/ })).toHaveTextContent("1/12");
    await user.click(form.getByRole("button", { name: "Add photo" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    const saved = await saveSection(user, "gallery", "gallery");
    expect(saved.images).toHaveLength(1);
  });
});

describe("Hours and contact forms", () => {
  it("toggles what the hours section shows and links to where the data lives", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Hours & location");
    expect(form.getByRole("link", { name: "weekly availability" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/resources",
    );
    await fill(user, form.getByRole("textbox", { name: /^Note/ }), "Free parking behind the building");
    await user.click(form.getByRole("switch", { name: "Show a directions link" }));

    const saved = await saveSection(user, "hours", "hours");
    expect(saved).toMatchObject({
      note: "Free parking behind the building",
      showMapLink: false,
      showAddress: true,
    });
  });

  it("toggles contact details", async () => {
    const user = userEvent.setup();
    renderEditor();
    const form = await openSection(user, "Contact");
    expect(form.getByRole("link", { name: "settings" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/general",
    );
    await user.click(form.getByRole("switch", { name: "Show phone" }));
    await user.click(form.getByRole("switch", { name: "Show email" }));
    await fill(user, form.getByRole("textbox", { name: /^Text/ }), "We reply within a day.");

    const saved = await saveSection(user, "contact", "contact");
    expect(saved).toMatchObject({
      showPhone: false,
      showEmail: false,
      showAddress: true,
      body: "We reply within a day.",
    });
  });
});
