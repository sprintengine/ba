"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { useStockSearch, useTrackStockDownload } from "@/lib/api/hooks";
import type { GeneratedPattern, SiteImage, SitePalette, SiteThemeKey, StockPhoto } from "@/lib/api/types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { generatedImage, stockImage, uploadedImage } from "@/lib/site/images";
import { GENERATED_PATTERNS } from "@/lib/site/plan";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { ImageUploadDropzone } from "@/components/dashboard/image-upload";
import { GeneratedArt, PATTERN_LABELS } from "@/components/site/generated-art";
import { SiteScope } from "@/components/site/site-scope";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ImageSource = "upload" | "stock" | "generated";

export type ImagePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (image: SiteImage) => void;
  businessId: string;
  theme: SiteThemeKey;
  palette: SitePalette;
  stockEnabled: boolean;
  uploadsEnabled: boolean;
  maxBytes: number;
  current?: SiteImage | null;
  /** Generated backgrounds suit heroes and banners, not team photos. */
  sources?: ImageSource[];
};

/** Choose an image: upload your own, search stock photos (Unsplash) or use a generated background. */
export function ImagePicker({
  open,
  onOpenChange,
  onPick,
  sources = ["upload", "stock", "generated"],
  ...props
}: ImagePickerProps) {
  const pick = (image: SiteImage) => {
    onPick(image);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>
            Upload a photo of your own, pick a stock photo, or use a background drawn from your colours.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Tabs defaultValue={sources[0]}>
            <TabsList>
              {sources.includes("upload") && <TabsTrigger value="upload">Upload</TabsTrigger>}
              {sources.includes("stock") && <TabsTrigger value="stock">Stock photos</TabsTrigger>}
              {sources.includes("generated") && <TabsTrigger value="generated">Generated</TabsTrigger>}
            </TabsList>
            <TabsContent value="upload">
              {props.uploadsEnabled ? (
                <ImageUploadDropzone
                  businessId={props.businessId}
                  maxBytes={props.maxBytes}
                  onUploaded={(u) => pick(uploadedImage(u))}
                />
              ) : (
                <EmptyState
                  size="sm"
                  title="Uploads aren't set up"
                  description="Image storage isn't configured on this server. Use a stock photo or a generated background."
                />
              )}
            </TabsContent>
            <TabsContent value="stock">
              <StockTab {...props} onPick={pick} />
            </TabsContent>
            <TabsContent value="generated">
              <GeneratedTab {...props} onPick={pick} />
            </TabsContent>
          </Tabs>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

type TabProps = Omit<ImagePickerProps, "open" | "onOpenChange" | "sources">;

function StockTab({ businessId, stockEnabled, onPick }: TabProps) {
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q.trim(), 350);
  const search = useStockSearch(businessId, query, 1, { enabled: stockEnabled });
  const track = useTrackStockDownload(businessId);
  if (!stockEnabled) {
    return (
      <EmptyState
        size="sm"
        title="Stock photos aren't set up"
        description="Add an Unsplash access key (UNSPLASH_ACCESS_KEY) on the server to search free stock photos. Until then, upload your own or use a generated background."
      />
    );
  }
  const choose = (photo: StockPhoto) => {
    track.mutate(photo.downloadLocation);
    onPick(stockImage(photo));
  };
  return (
    <div className="flex flex-col gap-4">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search photos, e.g. calm treatment room"
        leading={<Search />}
        aria-label="Search stock photos"
        autoFocus
      />
      {query.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least two letters to search Unsplash.</p>
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => search.refetch()} />
      ) : !search.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      ) : search.data.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos found. Try other words.</p>
      ) : (
        <ul className="grid max-h-[26rem] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {search.data.results.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => choose(photo)}
                className="group focus-ring relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted"
                style={{ backgroundColor: photo.color ?? undefined }}
                aria-label={`Use photo by ${photo.attribution.name}${photo.alt ? `: ${photo.alt}` : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Unsplash hotlinking is required by their API terms */}
                <img
                  src={photo.thumbUrl}
                  alt=""
                  className="size-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-left text-2xs text-white">
                  {photo.attribution.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Photos from Unsplash. The photographer is credited on your site, as Unsplash requires.
      </p>
    </div>
  );
}

function GeneratedTab({ theme, palette, current, onPick }: TabProps) {
  return (
    <SiteScope theme={theme} palette={palette} className="bg-transparent">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {GENERATED_PATTERNS.map((p: GeneratedPattern) => {
          const selected = current?.kind === "generated" && current.pattern === p;
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPick(generatedImage(p))}
                aria-pressed={selected}
                className={cn(
                  "focus-ring relative flex aspect-[4/3] w-full items-end overflow-hidden rounded-lg border border-border text-left",
                  selected && "ring-2 ring-ring",
                )}
              >
                <GeneratedArt pattern={p} />
                <span className="relative m-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-xs">
                  {selected && <Check className="size-3" aria-hidden />}
                  {PATTERN_LABELS[p]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SiteScope>
  );
}
