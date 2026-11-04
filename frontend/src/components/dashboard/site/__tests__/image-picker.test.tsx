import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StockPhoto } from "@/lib/api/types";
import { samplePlan } from "@/components/site/sample-site";
import { json, mockApi, renderDashboard, SITES_ON } from "../../test/render";
import { SiteEditorPage } from "../site-editor";
import { ImagePicker, type ImagePickerProps } from "../images/image-picker";
import { fakeSiteApi } from "./fake-site-api";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/site",
  useSearchParams: () => nav.params,
}));

const photo: StockPhoto = {
  id: "p1",
  url: "https://images.unsplash.com/photo-p1?w=1600",
  thumbUrl: "https://images.unsplash.com/photo-p1?w=400",
  width: 1600,
  height: 1000,
  color: "#aabbcc",
  alt: "A calm treatment room",
  attribution: {
    name: "Pat Doe",
    url: "https://unsplash.com/@pat?utm_source=bookanything&utm_medium=referral",
  },
  downloadLocation: "https://api.unsplash.com/photos/p1/download",
};

const onPick = vi.fn();
const calls: { method: string; path: string; body: unknown }[] = [];
beforeEach(() => {
  onPick.mockReset();
  calls.length = 0;
  mockApi((method, path, body) => {
    calls.push({ method, path, body });
    if (path.endsWith("/site/stock")) return { enabled: true, results: [photo] };
    if (path.endsWith("/site/stock/download")) return new Response(null, { status: 204 });
    if (path.endsWith("/uploads")) {
      return json(
        {
          url: "http://localhost:3000/api/v1/public/uploads/b1/0f0f0f0f-0000-4000-8000-000000000001.png",
          contentType: "image/png",
          bytes: 68,
          width: 1,
          height: 1,
        },
        201,
      );
    }
    return {};
  });
});
afterEach(() => vi.unstubAllGlobals());

function renderPicker(props: Partial<ImagePickerProps> = {}) {
  const plan = samplePlan("calm");
  return renderDashboard(
    <ImagePicker
      open
      onOpenChange={() => {}}
      onPick={onPick}
      businessId="b1"
      theme={plan.theme}
      palette={plan.palette}
      stockEnabled
      uploadsEnabled
      maxBytes={5 * 1024 * 1024}
      {...props}
    />,
  );
}

const png = (name = "photo.png", type = "image/png", size = 68) =>
  new File([new Uint8Array(size)], name, { type });

describe("ImagePicker", () => {
  it("uploads a PNG and picks the stored image", async () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText(/Drop an image or click to upload/), {
      target: { files: [png()] },
    });
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]?.[0]).toEqual({
      kind: "upload",
      url: "http://localhost:3000/api/v1/public/uploads/b1/0f0f0f0f-0000-4000-8000-000000000001.png",
      alt: "",
      pattern: null,
      attribution: null,
    });
    const upload = calls.find((c) => c.path.endsWith("/uploads"))!;
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("refuses other file types and oversized files before uploading", async () => {
    renderPicker({ maxBytes: 100 });
    const input = screen.getByLabelText(/Drop an image or click to upload/);
    fireEvent.change(input, { target: { files: [png("logo.svg", "image/svg+xml")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a PNG, JPEG or WebP image.");
    fireEvent.change(input, { target: { files: [png("big.png", "image/png", 101)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/at most 0 MB/);
    expect(calls.some((c) => c.path.endsWith("/uploads"))).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("shows the server's reason when an upload is rejected", async () => {
    mockApi((_m, path) =>
      path.endsWith("/uploads")
        ? json(
            {
              error: {
                code: "INVALID_REQUEST",
                message: "That file isn't a real image.",
                fields: { file: "Invalid" },
              },
            },
            400,
          )
        : {},
    );
    renderPicker();
    fireEvent.change(screen.getByLabelText(/Drop an image or click to upload/), {
      target: { files: [png()] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("That file isn't a real image.");
  });

  it("explains when uploads are not configured", () => {
    renderPicker({ uploadsEnabled: false });
    expect(screen.getByText("Uploads aren't set up")).toBeInTheDocument();
  });

  it("searches Unsplash, credits the photographer and tracks the download on pick", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("tab", { name: "Stock photos" }));
    await user.type(screen.getByRole("textbox", { name: "Search stock photos" }), "calm room");
    const result = await screen.findByRole("button", { name: /Use photo by Pat Doe/ });
    expect(calls.find((c) => c.path.endsWith("/site/stock"))).toBeTruthy();
    await user.click(result);
    expect(onPick.mock.calls[0]?.[0]).toEqual({
      kind: "stock",
      url: photo.url,
      alt: "A calm treatment room",
      pattern: null,
      attribution: photo.attribution,
    });
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/site/stock/download"))?.body).toEqual({
        downloadLocation: photo.downloadLocation,
      }),
    );
  });

  it("explains how to enable stock photos without a key", async () => {
    const user = userEvent.setup();
    renderPicker({ stockEnabled: false });
    await user.click(screen.getByRole("tab", { name: "Stock photos" }));
    expect(screen.getByText("Stock photos aren't set up")).toBeInTheDocument();
    expect(screen.getByText(/UNSPLASH_ACCESS_KEY/)).toBeInTheDocument();
  });

  it("offers generated backgrounds drawn from the palette", async () => {
    const user = userEvent.setup();
    renderPicker({ current: { kind: "generated", url: null, alt: "", pattern: "waves", attribution: null } });
    await user.click(screen.getByRole("tab", { name: "Generated" }));
    expect(screen.getByRole("button", { name: /Waves/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Mesh/ }));
    expect(onPick).toHaveBeenCalledWith({
      kind: "generated",
      url: null,
      alt: "",
      pattern: "mesh",
      attribution: null,
    });
  });

  it("only shows the allowed sources", () => {
    renderPicker({ sources: ["upload", "stock"] });
    expect(screen.queryByRole("tab", { name: "Generated" })).not.toBeInTheDocument();
  });
});

describe("image fields in section forms", () => {
  it("changes the hero image, edits alt text and removes it", async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams("tab=sections");
    const api = fakeSiteApi();
    renderDashboard(<SiteEditorPage />, "owner", SITES_ON);
    await user.click(await screen.findByRole("button", { name: /^Hero(?! options)/, expanded: false }));
    const group = screen.getByRole("group", { name: "Image" });
    expect(within(group).getByText("Generated · aurora")).toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: "Change" }));
    fireEvent.change(await screen.findByLabelText(/Drop an image or click to upload/), {
      target: { files: [png()] },
    });
    await waitFor(() => expect(within(group).getByText("Your upload")).toBeInTheDocument());
    await user.type(within(group).getByRole("textbox", { name: /Alt text/ }), "Our reception");

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "PUT")).toBe(true));
    const saved = (api.calls.find((c) => c.method === "PUT")!.body as { plan: ReturnType<typeof samplePlan> })
      .plan;
    expect(saved.sections[0]?.content).toMatchObject({ image: { kind: "upload", alt: "Our reception" } });

    // Saving adopts the server's copy, so the form re-mounts: query it again.
    const after = screen.getByRole("group", { name: "Image" });
    await user.click(within(after).getByRole("button", { name: "Remove" }));
    expect(within(screen.getByRole("group", { name: "Image" })).getByText("No image")).toBeInTheDocument();
  });
});
