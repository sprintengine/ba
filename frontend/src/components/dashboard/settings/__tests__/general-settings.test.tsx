import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, UpdateBusiness } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { business, json, renderDashboard } from "../../test/render";
import { GeneralSettings } from "../general-settings";
import { apiError, invalidRequest } from "./settings-fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/dashboard/lumen-physio/settings/general",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  replace.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

type Routes = {
  patch?: (body: UpdateBusiness) => unknown;
  slug?: (slug: string) => unknown;
  remove?: () => unknown;
};

/**
 * The business PATCH echoes the input onto the business; slug checks say "available" unless overridden. A stub of its
 * own rather than `mockApi`, because the slug check carries its slug in the query string.
 */
function api(routes: Routes = {}) {
  const patches: UpdateBusiness[] = [];
  const respond = (result: unknown) =>
    result instanceof Response
      ? result
      : result === undefined
        ? new Response(null, { status: 204 })
        : json(result);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/slug-available")) {
      const slug = url.searchParams.get("slug") ?? "";
      return respond(routes.slug?.(slug) ?? { available: true, suggestion: null });
    }
    if (url.pathname.endsWith("/v1/businesses/b1") && method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as UpdateBusiness;
      patches.push(body);
      return respond(routes.patch ? routes.patch(body) : saved(body));
    }
    if (url.pathname.endsWith("/v1/businesses/b1") && method === "DELETE") return respond(routes.remove?.());
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, patches };
}

const saved = (input: UpdateBusiness): Business => ({
  ...business,
  ...input,
  address: { ...business.address, ...input.address },
  status: input.status ?? business.status,
});

const textbox = (name: RegExp | string) => screen.getByRole("textbox", { name });

describe("GeneralSettings", () => {
  it("shows the business's details, with no save bar until something changes, and is axe-clean", async () => {
    api();
    const { container } = renderDashboard(<GeneralSettings />);
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(textbox("Business name")).toHaveValue("Lumen Physiotherapy");
    expect(textbox(/booking page address/i)).toHaveValue("lumen-physio");
    expect(screen.getByRole("switch", { name: "Published" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveTextContent("EUR");
    expect(screen.getByRole("combobox", { name: "Date and number format" })).toHaveTextContent(
      "English (Ireland)",
    );
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("validates on the client: the message sits under the field, which is invalid and focused", async () => {
    const { patches } = api();
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.clear(textbox("Business name"));
    await user.type(textbox(/^email/i), "not-an-email");
    await user.type(textbox(/website/i), "example.com");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const name = textbox("Business name");
    expect(await screen.findByText("Enter your business name")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter your business name");
    expect(name).toHaveFocus();
    expect(textbox(/^email/i)).toHaveAccessibleDescription("Enter a valid email");
    expect(textbox(/website/i)).toHaveAccessibleDescription(/Enter a full address/);
    expect(patches).toEqual([]);
  });

  it("rejects a reserved or malformed booking page address", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    const slug = textbox(/booking page address/i);
    await user.clear(slug);
    await user.type(slug, "ab");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(slug).toHaveAccessibleDescription(/At least 3 characters/);
    expect(slug).toHaveAttribute("aria-invalid", "true");
  });

  it("saves the form, resets it to what the server returned and moves to the new address", async () => {
    const { patches } = api();
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.clear(textbox("Business name"));
    await user.type(textbox("Business name"), "Lumen Physio");
    const slug = textbox(/booking page address/i);
    await user.clear(slug);
    // Typed upper case and spaces become a valid address.
    await user.type(slug, "Lumen Dublin");
    expect(slug).toHaveValue("lumen-dublin");
    expect(screen.getByText("Changing it breaks links you've already shared.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Available" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Published" }));
    await user.type(textbox(/town or city/i), " Dublin ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({
      name: "Lumen Physio",
      slug: "lumen-dublin",
      status: "draft",
      description: null,
      contactEmail: null,
      address: { line1: null, line2: null, city: "Dublin", postcode: null },
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Settings saved"));
    expect(replace).toHaveBeenCalledWith("/dashboard/lumen-dublin/settings/general");
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("puts server field errors under the right field", async () => {
    api({
      patch: () => invalidRequest({ contactPhone: "Must be a valid phone number" }),
    });
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.type(textbox(/phone/i), "0871234567");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const phone = await screen.findByRole("textbox", { name: /phone/i, description: /valid phone/ });
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveFocus();
    expect(textbox("Business name")).not.toHaveAttribute("aria-invalid");
    expect(replace).not.toHaveBeenCalled();
  });

  it("puts the server's address errors (named address.city…) under the flat address fields", async () => {
    api({ patch: () => invalidRequest({ "address.city": "Keep it under 100 characters" }) });
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.type(textbox(/town or city/i), "Dublin");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const city = await screen.findByRole("textbox", { name: /town or city/i, description: /under 100/ });
    expect(city).toHaveAttribute("aria-invalid", "true");
    expect(city).toHaveFocus();
    // Not repeated as a generic message at the top.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows other API errors at the top of the form", async () => {
    api({ patch: () => apiError(409, "SLUG_TAKEN", "That address was just taken.") });
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.type(textbox(/postcode/i), "D02");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That address was just taken.");
  });

  it("says when an address is taken, offers the suggestion and blocks saving it", async () => {
    const { patches } = api({
      slug: (s) =>
        s === "lumen" ? { available: false, suggestion: "lumen-2" } : { available: true, suggestion: null },
    });
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    const slug = textbox(/booking page address/i);
    await user.clear(slug);
    await user.type(slug, "lumen");
    expect(await screen.findByRole("img", { name: "Taken" })).toBeInTheDocument();
    // The status icon appearing doesn't replace the input: whoever is typing keeps the focus and can carry on.
    expect(textbox(/booking page address/i)).toBe(slug);
    expect(slug).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByRole("textbox", { name: /booking page address/i, description: /taken/ }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(patches).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Use lumen-2" }));
    expect(slug).toHaveValue("lumen-2");
    // The "taken" error goes with the taken address.
    await waitFor(() => expect(slug).not.toHaveAttribute("aria-invalid"));
    expect(await screen.findByRole("img", { name: "Available" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches).toMatchObject([{ slug: "lumen-2" }]));
  });

  it("discards unsaved changes", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.type(textbox(/about/i), "Sports injuries");
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(textbox(/about/i)).toHaveValue("");
    expect(screen.queryByText("You have unsaved changes")).not.toBeInTheDocument();
  });

  it("keeps the save bar above the phone tab bar and Bo's launcher, over them", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    await user.type(textbox(/about/i), "Sports injuries");
    // jsdom has no layout, so the placement is checked by its classes (end to end covers the real thing).
    const bar = screen.getByText("You have unsaved changes").parentElement!;
    expect(bar).toHaveClass("sticky", "max-sm:z-40");
    expect(bar.className).toContain(
      "max-sm:bottom-[calc(var(--tab-bar-height,0px)+env(safe-area-inset-bottom)+5rem)]",
    );
  });

  it("picks a currency with the keyboard", async () => {
    const { patches } = api();
    const user = userEvent.setup();
    renderDashboard(<GeneralSettings />);
    const currency = screen.getByRole("combobox", { name: "Currency" });
    currency.focus();
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "GBP" }));
    expect(currency).toHaveTextContent("GBP");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches[0]).toMatchObject({ currency: "GBP" }));
  });

  describe("deleting the business", () => {
    it("is only offered to owners", () => {
      api();
      renderDashboard(<GeneralSettings />, "admin");
      expect(screen.queryByRole("button", { name: /delete lumen/i })).not.toBeInTheDocument();
    });

    it("asks first, then deletes and leaves the dashboard", async () => {
      const { fetchMock } = api();
      const user = userEvent.setup();
      renderDashboard(<GeneralSettings />);
      await user.click(screen.getByRole("button", { name: "Delete Lumen Physiotherapy" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Delete Lumen Physiotherapy?" });
      await expectNoAxeViolations(document.body);
      await user.click(within(dialog).getByRole("button", { name: "Delete business" }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
      expect(toast.success).toHaveBeenCalledWith("Business deleted");
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
    });

    it("can be cancelled with Escape", async () => {
      api();
      const user = userEvent.setup();
      renderDashboard(<GeneralSettings />);
      await user.click(screen.getByRole("button", { name: "Delete Lumen Physiotherapy" }));
      expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Delete Lumen Physiotherapy" })).toHaveFocus();
    });

    it("reports a failure", async () => {
      api({ remove: () => apiError(403, "FORBIDDEN", "Only an owner can delete the business.") });
      const user = userEvent.setup();
      renderDashboard(<GeneralSettings />);
      await user.click(screen.getByRole("button", { name: "Delete Lumen Physiotherapy" }));
      await user.click(await screen.findByRole("button", { name: "Delete business" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only an owner can delete the business."));
      expect(replace).not.toHaveBeenCalled();
    });

    it("says what deleting does, and passes on the refusal while a paid plan is billing", async () => {
      const refusal =
        "Cancel your plan in Billing first. Deleting the business doesn't stop its subscription.";
      api({ remove: () => apiError(409, "CONFLICT", refusal) });
      const user = userEvent.setup();
      renderDashboard(<GeneralSettings />);
      expect(screen.getByText(/can't restore the business yourself/)).toBeInTheDocument();
      expect(screen.queryByText(/30 days/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Delete Lumen Physiotherapy" }));
      await user.click(await screen.findByRole("button", { name: "Delete business" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(refusal));
      expect(replace).not.toHaveBeenCalled();
    });
  });
});
