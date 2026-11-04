/** The review step's business section, server errors, Create and Start over. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUSINESS_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import {
  createButton,
  fixture,
  invalidRequest,
  json,
  mockOnboardingApi,
  renderReview,
  paste,
} from "./render";

const tz = vi.hoisted(() => {
  const device: { browser: string | null } = { browser: "America/New_York" };
  return device;
});
vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  browserTimeZone: () => tz.browser,
}));

beforeEach(() => {
  tz.browser = "America/New_York";
  window.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe("Review step: your business", () => {
  it("is axe-clean and shows the draft with live slug availability", async () => {
    mockOnboardingApi();
    const { container } = renderReview();

    expect(screen.getByRole("heading", { name: "Review your business" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /business name/i })).toHaveValue("Gleam Car Wash");
    expect(screen.getByRole("textbox", { name: /business name/i })).toHaveAttribute(
      "maxLength",
      String(BUSINESS_LIMITS.name),
    );
    expect(screen.getByRole("textbox", { name: /short description/i })).toHaveAttribute(
      "maxLength",
      String(BUSINESS_LIMITS.description),
    );
    expect(
      await screen.findByText("Available. Your booking page will be at bookanything.ie/gleam-car-wash"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Ready to create").length).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it("validates the name and address as you type, and the slug follows the name until edited", async () => {
    const user = userEvent.setup();
    mockOnboardingApi();
    renderReview();
    const name = screen.getByRole("textbox", { name: /business name/i });
    const slug = screen.getByRole("textbox", { name: /booking page address/i });

    await user.clear(name);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter your business name");
    expect(screen.getAllByText("1 to fix").length).toBeGreaterThan(0);

    await paste(user, name, "Gleam Galway");
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(slug).toHaveValue("gleam-galway");

    await user.clear(slug);
    await user.type(slug, "Gleam  Car!");
    expect(slug).toHaveValue("gleam--car");
    expect(slug).toHaveAccessibleDescription(/Must not contain consecutive hyphens/);
    await user.clear(slug);
    await user.type(slug, "ab");
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAccessibleDescription(/Use 3 to 50 lowercase letters, numbers or hyphens/);

    await user.clear(slug);
    await paste(user, slug, "gleam-west");
    await user.click(screen.getByRole("button", { name: /match business name/i }));
    expect(slug).toHaveValue("gleam-galway");
  });

  it("offers the device's timezone and edits the wording with a live example", async () => {
    const user = userEvent.setup();
    mockOnboardingApi();
    renderReview();

    expect(screen.getByText(/your device uses america\/new york/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use it" }));
    expect(screen.getByRole("combobox", { name: /timezone/i })).toHaveTextContent(/new york/i);
    expect(screen.queryByRole("button", { name: "Use it" })).not.toBeInTheDocument();

    const wording = screen.getByRole("button", { name: /wording/i });
    expect(wording).toHaveAttribute("aria-expanded", "false");
    wording.focus();
    await user.keyboard("{Enter}");
    expect(wording).toHaveAttribute("aria-expanded", "true");

    const singular = screen.getByRole("textbox", { name: "What people book, singular" });
    await user.clear(singular);
    expect(singular).toHaveAccessibleDescription("Required");
    expect(screen.getByText("· needs attention")).toBeInTheDocument();
    await paste(user, singular, "Lane");
    const plural = screen.getByRole("textbox", { name: "Who books, plural" });
    await user.clear(plural);
    await paste(user, plural, "Drivers");
    expect(screen.getByText(/You have 8 bookings today across 3 bays/)).toBeInTheDocument();
    expect(screen.queryByText("· needs attention")).not.toBeInTheDocument();
  });

  it("picks the currency from the keyboard and keeps an unlisted one selectable", async () => {
    const user = userEvent.setup();
    mockOnboardingApi();
    renderReview({ ...fixture(), currency: "ISK" });
    const currency = screen.getByRole("combobox", { name: /currency/i });
    expect(currency).toHaveTextContent("ISK");
    expect(currency).toHaveAccessibleDescription("Prices and payments use this currency.");

    currency.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("option", { name: "ISK" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /GBP/ }));
    expect(currency).toHaveTextContent("GBP");
  });

  it("creates the business from the trimmed draft", async () => {
    const user = userEvent.setup();
    const api = mockOnboardingApi();
    const { onCreated } = renderReview();
    await screen.findByText(/^Available\./);

    await user.click(createButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith({
      id: "b-new",
      slug: "gleam-car-wash",
      name: "Gleam Car Wash",
      primaryColor: "#0369a1",
      hasPaidServices: true,
    });
    const post = api.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      name: "Gleam Car Wash",
      slug: "gleam-car-wash",
    });
  });

  it("puts server field errors under their fields until the next edit", async () => {
    const user = userEvent.setup();
    mockOnboardingApi({
      create: () =>
        invalidRequest(
          { name: "That name is reserved", description: "Too promotional" },
          "Fix the highlighted fields.",
        ),
    });
    const { onCreated } = renderReview();
    await screen.findByText(/^Available\./);

    await user.click(createButton());
    const name = screen.getByRole("textbox", { name: /business name/i });
    await waitFor(() => expect(name).toHaveAccessibleDescription("That name is reserved"));
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: /short description/i })).toHaveAccessibleDescription(
      /Too promotional/,
    );
    expect(screen.getAllByRole("alert").some((el) => el.textContent === "Fix the highlighted fields.")).toBe(
      true,
    );
    expect(onCreated).not.toHaveBeenCalled();

    await paste(user, name, " Co");
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Fix the highlighted fields.")).not.toBeInTheDocument();
  });

  it("shows other failures as a message by Create", async () => {
    const user = userEvent.setup();
    mockOnboardingApi({
      create: () =>
        json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Something broke on our side" } }, 500),
    });
    renderReview();
    await screen.findByText(/^Available\./);
    await user.click(createButton());
    expect((await screen.findAllByRole("alert")).map((el) => el.textContent)).toContain(
      "Something broke on our side",
    );
  });

  describe("when a create's response is lost but the business was made", () => {
    const gleam = {
      businessId: "b-new",
      slug: "gleam-car-wash",
      name: "Gleam Car Wash",
      role: "owner" as const,
      branding: { primaryColor: "#0369a1", logoUrl: null, coverImageUrl: null },
    };
    const createdGleam = {
      id: "b-new",
      slug: "gleam-car-wash",
      name: "Gleam Car Wash",
      primaryColor: "#0369a1",
      hasPaidServices: true,
    };

    it("recognises it after a network error", async () => {
      const user = userEvent.setup();
      let created = false;
      mockOnboardingApi({
        memberships: () => (created ? [gleam] : []),
        create: () => {
          created = true;
          throw new TypeError("Failed to fetch");
        },
      });
      const { onCreated } = renderReview();
      await screen.findByText(/^Available\./);
      await user.click(createButton());
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdGleam));
    });

    it("recognises it when the retry finds its address taken", async () => {
      const user = userEvent.setup();
      let created = false;
      mockOnboardingApi({
        memberships: () => (created ? [gleam] : []),
        create: () => {
          if (created)
            return json({ error: { code: "SLUG_TAKEN", message: "Taken", fields: { slug: "Taken" } } }, 409);
          created = true;
          return json({ error: { code: "BAD_GATEWAY", message: "Bad gateway" } }, 502);
        },
      });
      const { onCreated } = renderReview();
      await screen.findByText(/^Available\./);
      await user.click(createButton());
      expect((await screen.findAllByRole("alert")).map((el) => el.textContent)).toContain("Bad gateway");
      await user.click(createButton());
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdGleam));
    });

    it("still reports a taken address that isn't the user's new business", async () => {
      const user = userEvent.setup();
      mockOnboardingApi({
        memberships: () => [gleam],
        create: () =>
          json({ error: { code: "SLUG_TAKEN", message: "Taken", fields: { slug: "Taken by you" } } }, 409),
      });
      const { onCreated } = renderReview();
      await screen.findByText(/^Available\./);
      await user.click(createButton());
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: /booking page address/i })).toHaveAccessibleDescription(
          /Taken by you/,
        ),
      );
      expect(onCreated).not.toHaveBeenCalled();
    });
  });

  it("shows a taken address with a suggestion to use instead", async () => {
    const user = userEvent.setup();
    mockOnboardingApi({ taken: (slug) => slug === "gleam-car-wash" });
    renderReview();
    const slug = screen.getByRole("textbox", { name: /booking page address/i });
    await waitFor(() => expect(slug).toHaveAccessibleDescription(/That address is already taken/));
    await user.click(screen.getByRole("button", { name: "bookanything.ie/gleam-car-wash-2" }));
    expect(slug).toHaveValue("gleam-car-wash-2");
  });

  it("asks before starting over; Escape keeps the draft", async () => {
    const user = userEvent.setup();
    mockOnboardingApi();
    const { onStartOver } = renderReview();

    await user.click(screen.getByRole("button", { name: "Start over" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Start over?" });
    await expectNoAxeViolations(document.body);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(onStartOver).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard draft" }),
    );
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it("jumps from the problem list to the field", async () => {
    const user = userEvent.setup();
    mockOnboardingApi();
    renderReview({ ...fixture(), name: "" });

    expect(screen.getAllByText("1 thing to fix before creating").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /1 thing to fix$/ }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /business name/i })).toHaveFocus());
  });
});
