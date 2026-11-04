"use client";

import { useId, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useUploadImage } from "@/lib/api/hooks";
import type { Upload } from "@/lib/api/types";
import { uploadProblem } from "@/lib/site/images";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Drop or choose a PNG/JPEG/WebP; uploads it to the business's storage (the server re-checks the
 * type from the bytes and strips metadata) and reports the stored image.
 */
export function ImageUploadDropzone({
  businessId,
  onUploaded,
  maxBytes = DEFAULT_MAX_UPLOAD_BYTES,
  disabled = false,
  compact = false,
  label,
  className,
}: {
  businessId: string;
  onUploaded: (upload: Upload) => void;
  maxBytes?: number;
  disabled?: boolean;
  compact?: boolean;
  /** The file input's accessible name, when a page has more than one dropzone ("Upload a logo"). */
  label?: string;
  className?: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadImage(businessId);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    const problem = uploadProblem(file, maxBytes);
    setError(problem);
    if (problem) return;
    try {
      onUploaded(await upload.mutateAsync(file));
    } catch (err) {
      setError(errorMessage(err, "The upload failed. Please try again."));
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-sunken text-center transition-colors",
          "focus-within:ring-2 focus-within:ring-ring hover:border-brand hover:bg-brand-soft/40",
          compact ? "px-4 py-4" : "px-6 py-10",
          dragging && "border-brand bg-brand-soft/50",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {upload.isPending ? (
          <Spinner label="Uploading" />
        ) : (
          <ImageUp className="size-6 text-muted-foreground" aria-hidden />
        )}
        <span className="text-sm font-medium">
          {upload.isPending ? "Uploading…" : "Drop an image or click to upload"}
        </span>
        {!compact && (
          <span className="text-xs text-muted-foreground">
            PNG, JPEG or WebP up to {Math.floor(maxBytes / (1024 * 1024))} MB. Location data and other
            metadata are removed.
          </span>
        )}
        <input
          id={inputId}
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={label}
          disabled={disabled || upload.isPending}
          onChange={(e) => void handle(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
