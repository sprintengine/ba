"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { ScaledFrame } from "@/components/site/scaled-frame";
import { SiteRenderer } from "@/components/site/site-renderer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useEditorServices } from "./editor-data";
import { useEditor } from "./use-site-editor";

type Device = "desktop" | "mobile";
type Mode = "light" | "dark";

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, mobile: 390 };

/**
 * Live preview of the unsaved plan at true desktop (scaled) or mobile width, in light or dark.
 * Clicking a section selects it for editing; links don't navigate.
 */
export function SitePreview({
  selectedId,
  onSelect,
  className,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const business = useCurrentBusiness();
  const services = useEditorServices();
  const { plan: livePlan, site } = useEditor();
  // The preview catches up after typing instead of holding up every keystroke (a whole site renders here).
  const plan = useDeferredValue(livePlan);
  const [device, setDevice] = useState<Device>("desktop");
  const [mode, setMode] = useState<Mode>("light");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scroller.current;
    const target = selectedId
      ? container?.querySelector<HTMLElement>(`[data-section-id="${cssEscape(selectedId)}"]`)
      : null;
    if (!container || !target) return;
    const top =
      target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8;
    container.scrollTo({ top, behavior: "smooth" });
  }, [selectedId, device]);

  const onClickCapture = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("a, button, summary")) e.preventDefault();
    const id = el.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId;
    if (id) onSelect(id);
  };

  // A section (not a div): the rendered site's own header and footer stay inside it rather than becoming a second
  // banner and contentinfo landmark on the dashboard page.
  return (
    <section
      aria-label="Site preview"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-sunken",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <SegmentedControl
          size="sm"
          aria-label="Preview size"
          collapseLabels="sm"
          value={device}
          onValueChange={setDevice}
          options={[
            { value: "desktop", label: "Desktop", icon: <Monitor /> },
            { value: "mobile", label: "Mobile", icon: <Smartphone /> },
          ]}
        />
        <SegmentedControl
          size="sm"
          aria-label="Preview colour mode"
          collapseLabels="sm"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "light", label: "Light", icon: <Sun /> },
            { value: "dark", label: "Dark", icon: <Moon /> },
          ]}
        />
        <span className="ml-auto hidden truncate font-mono text-xs text-muted-foreground sm:block">
          bookanything.ie/{business.slug}
        </span>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 scrollbar-thin overflow-y-auto"
        data-testid="site-preview"
      >
        {/* A scaled picture of the site, not its controls: a tap selects a section (exempt from the touch-size guard). */}
        <div
          data-touch-exempt=""
          onClickCapture={onClickCapture}
          className={cn(
            "mx-auto",
            device === "mobile"
              ? "my-6 w-[406px] max-w-full overflow-hidden rounded-[2rem] border-8 border-foreground/85 shadow-xl"
              : "w-full",
          )}
        >
          <ScaledFrame width={DEVICE_WIDTH[device]}>
            <SiteRenderer
              plan={plan}
              business={business}
              services={services}
              context={site.context}
              mode="preview"
              colorMode={mode}
              selectedSectionId={selectedId}
            />
          </ScaledFrame>
        </div>
      </div>
    </section>
  );
}

/** Section ids are `[a-z0-9-]`, but escape anyway (CSS.escape is missing in some test DOMs). */
function cssEscape(value: string) {
  return typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}
