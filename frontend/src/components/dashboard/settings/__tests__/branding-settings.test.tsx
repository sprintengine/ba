import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, UpdateBusiness, Upload } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { business, mockApi, renderDashboard, SITES_ON } from "../../test/render";
import { BrandingSettings } from "../branding-settings";
import { invalidRequest } from "./settings-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/branding",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => toast.success.mockClear());
afterEach(() => vi.unstubAllGlobals());

const upload: Upload = {
  url: "https://cdn.example.test/logo.png",
  contentType: "image/png",
  bytes: 1200,
  width: 256,
  height: 256,
};

function api(patch?: (body: UpdateBusiness) => unknown) {
  const patches: UpdateBusiness[] = [];
  mockApi((method, path, body) => {
    if (path.endsWith("/uploads") && method === "POST") return upload;
    if (path === "/v1/businesses/b1" && method === "PATCH") {
      const input = body as UpdateBusiness;
      patches.push(input);
      if (patch) return patch(input);
      return {
        ...business,
        branding: { ...business.branding, ...input.branding },
        vocabulary: { ...business.vocabulary, ...input.vocabulary },
      } satisfies Business;
    }
    return {};
  });
  return patches;
}

const field = (name: string | RegExp) => screen.getByRole("textbox", { name });
const preview = () => screen.getByRole("group", { name: "Booking page preview" });

describe("BrandingSettings", () => {
  it("previews the booking page with the business's colour and words; axe-clean", async () => {
    api();
    const { container } = renderDashboard(<BrandingSettings />);
    expect(screen.getByRole("heading", { name: "Branding" })).toBeInTheDocument();
    expect(within(preview()).getByText("Book an appointment")).toBeInTheDocument();
    expect(within(preview()).getByText("My appointments")).toBeInTheDocument();
    expect(field("Hex colour")).toHaveValue("#0e7c70");
    expect(screen.getByRole("radio", { name: "#0e7c70" })).toBeChecked();
    expect(field("What's booked (one)")).toHaveValue("appointment");
    await expectNoAxeViolations(container);
  });

  it("updates the preview as the wording and images change", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<BrandingSettings />);
    await user.clear(field("What's booked (one)"));
    await user.type(field("What's booked (one)"), "lesson");
    await user.clear(field("What's booked (many)"));
    await user.type(field("What's booked (many)"), "lessons");
    expect(within(preview()).getByText("Book a lesson")).toBeInTheDocument();
    expect(within(preview()).getByText("My lessons")).toBeInTheDocument();
    await user.type(field("Cover image address"), "https://cdn.example.test/cover.jpg");
    expect(preview().querySelector("img")).toHaveAttribute("src", "https://cdn.example.test/cover.jpg");
  });

  it("validates the wording and image addresses on the client", async () => {
    const patches = api();
    const user = userEvent.setup();
    renderDashboard(<BrandingSettings />);
    await user.clear(field("Who books (one)"));
    await user.type(field("Logo image address"), "logo.png");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const customer = field("Who books (one)");
    expect(customer).toHaveAccessibleDescription("Required");
    expect(customer).toHaveAttribute("aria-invalid", "true");
    expect(field("Logo image address")).toHaveAccessibleDescription(/Enter a full image address/);
    expect(patches).toEqual([]);
  });

  it("saves the branding, style and wording, trimmed, with blank images as null", async () => {
    const patches = api();
    const user = userEvent.setup();
    renderDashboard(<BrandingSettings />);
    await user.click(screen.getByRole("radio", { name: "#1d4ed8" }));
    const styles = screen.getByRole("radiogroup", { name: "Booking page style" });
    expect(within(styles).getByRole("radio", { name: /^Calm/ })).toHaveAttribute("aria-checked", "true");
    await user.click(within(styles).getByRole("radio", { name: /^Bold/ }));
    await user.clear(field("Who books (one)"));
    await user.type(field("Who books (one)"), " client ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      branding: { primaryColor: "#1d4ed8", logoUrl: null, coverImageUrl: null, portalStyle: "bold" },
      vocabulary: { ...business.vocabulary, customer: "client" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Changes saved")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("leaves the style to the site's theme where business websites are on", () => {
    api();
    renderDashboard(<BrandingSettings />, "owner", SITES_ON);
    expect(screen.queryByRole("radiogroup", { name: "Booking page style" })).not.toBeInTheDocument();
  });

  it("puts the server's branding.* and vocabulary.* errors under their fields", async () => {
    api(() =>
      invalidRequest({
        "vocabulary.customers": "At most 40 characters",
        "branding.logoUrl": "Must be an http(s) URL",
      }),
    );
    const user = userEvent.setup();
    renderDashboard(<BrandingSettings />);
    await user.type(field("Logo image address"), "https://cdn.example.test/a.png");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByRole("textbox", { name: "Logo image address", description: /http\(s\) URL/ }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(field("Who books (many)")).toHaveAccessibleDescription("At most 40 characters");
  });

  it("uploads a logo into the logo address", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<BrandingSettings />);
    await user.upload(
      screen.getByLabelText("Upload a logo"),
      new File(["png"], "logo.png", { type: "image/png" }),
    );
    await waitFor(() => expect(field("Logo image address")).toHaveValue(upload.url));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("discards unsaved changes", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<BrandingSettings />);
    await user.type(field("Cover image address"), "https://cdn.example.test/c.jpg");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(field("Cover image address")).toHaveValue("");
  });
});
