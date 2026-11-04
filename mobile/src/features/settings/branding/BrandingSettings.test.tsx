import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { business } from "@shared/api/__tests__/fixtures/business";
import { upload } from "@shared/api/__tests__/fixtures/site";
import { apiError, json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { BrandingSettings } from "./BrandingSettings";
import { imageType } from "./upload";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));

const pick = jest.mocked(ImagePicker.launchImageLibraryAsync);
const PATH = `/v1/businesses/${business.id}`;

function api(handle?: (method: string, path: string, body: unknown) => unknown) {
  const patches: unknown[] = [];
  const fetch = mockApi((method, path, body) => {
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "POST" && path === `${PATH}/uploads`) return upload;
    if (method === "PATCH" && path === PATH) {
      patches.push(body);
      const input = body as { branding: object; vocabulary: object };
      return {
        ...business,
        branding: { ...business.branding, ...input.branding },
        vocabulary: { ...business.vocabulary, ...input.vocabulary },
      };
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { fetch, patches };
}

const asset = (patch: Partial<ImagePicker.ImagePickerAsset> = {}): ImagePicker.ImagePickerResult => ({
  canceled: false,
  assets: [
    {
      uri: "file:///photos/logo.png",
      width: 800,
      height: 800,
      fileName: "logo.png",
      mimeType: "image/png",
      fileSize: 200_000,
      ...patch,
    } as ImagePicker.ImagePickerAsset,
  ],
});

const render = (patch?: Parameters<typeof renderBusinessScreen>[1]) =>
  renderBusinessScreen(<BrandingSettings />, { path: "settings/branding", ...patch });

describe("Settings › Branding", () => {
  it("previews the business's look and words, live as they change", async () => {
    api();
    render();
    const preview = await screen.findByTestId("branding-preview");
    expect(preview).toHaveAccessibleName(
      "Booking page preview: Lumen Physiotherapy, in your colour, with your logo and cover image.",
    );
    expect(screen.getByText("Book an appointment")).toBeOnTheScreen();
    expect(screen.getByText("My appointments")).toBeOnTheScreen();
    expect(screen.getByTestId("branding-logo-url")).toHaveDisplayValue(business.branding.logoUrl!);

    fireEvent.changeText(screen.getByTestId("branding-word-booking"), "lesson");
    fireEvent.changeText(screen.getByTestId("branding-word-bookings"), "lessons");
    expect(screen.getByText("Book a lesson")).toBeOnTheScreen();
    expect(screen.getByText("My lessons")).toBeOnTheScreen();
    expect(screen.getByTestId("branding-style-minimal")).toBeChecked();
  });

  it("saves the colour, images, style and words with the exact body", async () => {
    const { patches } = api();
    render();
    fireEvent.press(await screen.findByTestId("branding-color-#1d4ed8"));
    fireEvent.press(screen.getByTestId("branding-cover-remove"));
    fireEvent.press(screen.getByTestId("branding-style-calm"));
    fireEvent.changeText(screen.getByTestId("branding-word-customer"), " client ");
    fireEvent.changeText(screen.getByTestId("branding-word-customers"), "clients");
    expect(screen.getByTestId("save-bar")).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      branding: {
        primaryColor: "#1d4ed8",
        logoUrl: business.branding.logoUrl,
        coverImageUrl: null,
        portalStyle: "calm",
      },
      vocabulary: { ...business.vocabulary, customer: "client", customers: "clients" },
    });
    expect(await screen.findByText("Branding saved")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("save-bar")).toBeNull());
  });

  it("uploads a logo chosen from the photo library and uses its address", async () => {
    const { fetch } = api();
    const append = jest.spyOn(FormData.prototype, "append");
    pick.mockResolvedValueOnce(asset());
    render();
    await act(async () => fireEvent.press(await screen.findByTestId("branding-logo-choose")));
    await waitFor(() => expect(screen.getByTestId("branding-logo-url")).toHaveDisplayValue(upload.url));
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }));
    const [, init] = fetch.mock.calls.find(([url]) => String(url).endsWith("/uploads"))!;
    expect(init!.body).toBeInstanceOf(FormData);
    // React Native's FormData takes the file as { uri, name, type } (Node's, here, would stringify it).
    expect(append).toHaveBeenCalledWith("file", {
      uri: "file:///photos/logo.png",
      name: "logo.png",
      type: "image/png",
    });
    expect(screen.getByTestId("save-bar")).toBeOnTheScreen();
  });

  it("doesn't crop the cover, and does nothing when the picker is cancelled", async () => {
    const { fetch } = api();
    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    render();
    await act(async () => fireEvent.press(await screen.findByTestId("branding-cover-choose")));
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: false }));
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/uploads"))).toBe(false);
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });

  it("says why a photo can't be used, before uploading it", async () => {
    const { fetch } = api();
    render();
    pick.mockResolvedValueOnce(asset({ mimeType: "image/heic", fileName: "IMG_1.heic" }));
    await act(async () => fireEvent.press(await screen.findByTestId("branding-logo-choose")));
    expect(await screen.findByText("Use a PNG, JPEG or WebP image.")).toBeOnTheScreen();

    pick.mockResolvedValueOnce(asset({ fileSize: 6 * 1024 * 1024 }));
    await act(async () => fireEvent.press(screen.getByTestId("branding-logo-choose")));
    expect(await screen.findByText("Images can be at most 5 MB.")).toBeOnTheScreen();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/uploads"))).toBe(false);

    // Removing the image clears the message.
    fireEvent.press(screen.getByTestId("branding-logo-remove"));
    expect(screen.queryByTestId("branding-logo-error")).toBeNull();
    expect(screen.getByTestId("branding-logo-url")).toHaveDisplayValue("");
  });

  it("says when the upload or the picker fails", async () => {
    api((method, path) =>
      path.endsWith("/uploads") ? apiError(413, "PAYLOAD_TOO_LARGE", "That image is too big.") : undefined,
    );
    render();
    pick.mockResolvedValueOnce(asset());
    await act(async () => fireEvent.press(await screen.findByTestId("branding-cover-choose")));
    expect(await screen.findByText("That image is too big.")).toBeOnTheScreen();

    pick.mockRejectedValueOnce(new Error("No access to photos"));
    await act(async () => fireEvent.press(screen.getByTestId("branding-cover-choose")));
    expect(await screen.findByText("No access to photos")).toBeOnTheScreen();
  });

  it("checks image addresses and words before saving, and shows the server's errors on the fields", async () => {
    const { patches } = api((method) =>
      method === "PATCH"
        ? json(
            {
              error: {
                code: "INVALID_REQUEST",
                message: "Check the highlighted fields.",
                fields: { "vocabulary.resource": "Too long" },
              },
            },
            400,
          )
        : undefined,
    );
    render();
    fireEvent.changeText(await screen.findByTestId("branding-logo-url"), "logo.png");
    fireEvent.changeText(screen.getByTestId("branding-word-bookings"), " ");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByText("Enter a full image address starting with https://")).toBeOnTheScreen();
    expect(screen.getByText("Required")).toBeOnTheScreen();
    expect(patches).toEqual([]);

    fireEvent.changeText(screen.getByTestId("branding-logo-url"), "https://cdn.example.test/new.png");
    fireEvent.changeText(screen.getByTestId("branding-word-bookings"), "sessions");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByText("Too long")).toBeOnTheScreen();
  });

  it("with a site, leaves the style to the site editor", async () => {
    api();
    render({ business: { sitesEnabled: true } });
    expect(
      await screen.findByText("Wide photo (3:1) used when your site has no hero image of its own."),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("branding-style")).toBeNull();
  });

  it("discards unsaved changes", async () => {
    api();
    render();
    fireEvent.changeText(await screen.findByTestId("branding-word-resource"), "coach");
    fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByTestId("branding-word-resource")).toHaveDisplayValue("therapist");
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });
});

describe("imageType", () => {
  it("uses the picker's type, else the file's extension", () => {
    expect(imageType({ uri: "file:///a.png", mimeType: "image/webp" })).toBe("image/webp");
    expect(imageType({ uri: "file:///a.JPG" })).toBe("image/jpeg");
    expect(imageType({ uri: "file:///a", fileName: "b.webp" })).toBe("image/webp");
    expect(imageType({ uri: "file:///a.gif" })).toBe("application/octet-stream");
  });
});
