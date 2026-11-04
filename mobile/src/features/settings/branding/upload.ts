/**
 * Choosing an image from the photo library and uploading it with the website's hook (`useUploadImage`, the same
 * `POST /uploads` as its ImageUploadDropzone). The server re-checks the type from the bytes and strips metadata.
 */
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { errorMessage } from "@shared/api/client";
import { useUploadImage } from "@shared/api/hooks/use-site";
import type { Upload } from "@shared/api/types";
import { uploadProblem } from "@shared/site/images";

/** The website's DEFAULT_MAX_UPLOAD_BYTES. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type PickedImage = { uri: string; name: string; type: string; size: number | undefined };

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The picked file's type: the picker's, else from its extension. */
export function imageType(
  asset: Pick<ImagePicker.ImagePickerAsset, "mimeType" | "uri" | "fileName">,
): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = (asset.fileName ?? asset.uri).split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}

/**
 * The system photo picker (no permission prompt on iOS 14+ and Android 13+). A logo is cropped square; a cover isn't
 * cropped (iOS can only crop square, and a cover is 3:1). HEIC photos come back as JPEG.
 */
export async function pickImage(crop: "square" | "none"): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: crop === "square",
    aspect: crop === "square" ? [1, 1] : undefined,
    quality: 0.85,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const type = imageType(asset);
  const ext = type.split("/")[1] ?? "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `image.${ext}`, type, size: asset.fileSize };
}

/**
 * Pick → check → upload, with its state: `busy` while uploading, `error` (said under the field) when the file is
 * unsuitable or the upload fails. Resolves the stored image, or null.
 */
export function useImageUpload(businessId: string) {
  const upload = useUploadImage(businessId);
  const [error, setError] = useState<string | null>(null);

  const choose = async (crop: "square" | "none"): Promise<Upload | null> => {
    setError(null);
    let picked: PickedImage | null;
    try {
      picked = await pickImage(crop);
    } catch (err) {
      setError(errorMessage(err, "Couldn't open your photos."));
      return null;
    }
    if (!picked) return null;
    const problem = uploadProblem({ type: picked.type, size: picked.size ?? 0 }, MAX_UPLOAD_BYTES);
    if (problem) {
      setError(problem);
      return null;
    }
    try {
      // React Native's FormData sends a `{ uri, name, type }` part as the file at `uri` (the hook types it as a Blob).
      const file = { uri: picked.uri, name: picked.name, type: picked.type };
      return await upload.mutateAsync(file as unknown as Blob);
    } catch (err) {
      setError(errorMessage(err, "The upload failed. Please try again."));
      return null;
    }
  };

  return { choose, busy: upload.isPending, error, clearError: () => setError(null) };
}
