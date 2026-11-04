"use client";

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useRestoreSiteVersion, useSiteVersions } from "@/lib/api/hooks";
import type { SiteVersion } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatDateTime } from "@/lib/format";
import { VERSION_SOURCE_LABELS } from "@/lib/site/ai";
import { ErrorState } from "@/components/common/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { PanelSection } from "./panel-section";
import { useEditor } from "./use-site-editor";

/** Every saved version of the draft; restoring copies it into a new draft version. */
export function HistoryPanel() {
  const business = useCurrentBusiness();
  const versions = useSiteVersions(business.id);
  const restore = useRestoreSiteVersion(business.id);
  const { adopt, dirty } = useEditor();
  const [target, setTarget] = useState<SiteVersion | null>(null);

  const doRestore = async (v: SiteVersion) => {
    try {
      adopt(await restore.mutateAsync(v.version));
      toast.success(`Version ${v.version} restored to your draft`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <PanelSection
      title="History"
      description="Each save, AI change and restore is a version. Restoring puts it back in your draft; publish to make it live."
    >
      {versions.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : versions.isError ? (
        <ErrorState error={versions.error} onRetry={() => versions.refetch()} />
      ) : versions.data.items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<History />}
          title="No versions yet"
          description="Save or publish your site to start its history."
        />
      ) : (
        <ol aria-label="Versions" className="flex flex-col gap-2">
          {versions.data.items.map((v) => (
            <li
              key={v.version}
              className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  Version {v.version}
                  <span className="font-normal text-muted-foreground">
                    · {VERSION_SOURCE_LABELS[v.source]}
                  </span>
                  {v.isPublished && <Badge tone="success">Live</Badge>}
                  {v.isDraft && <Badge tone="neutral">Draft</Badge>}
                </p>
                {v.instruction && <p className="mt-0.5 text-sm">“{v.instruction}”</p>}
                {v.changes.length > 0 && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v.changes.join(" · ")}</p>
                )}
                <p className="mt-1 text-xs text-subtle-foreground">
                  {formatDateTime(v.createdAt, business.timezone, business.locale)}
                  {v.actorName && ` · ${v.actorName}`}
                </p>
              </div>
              {!v.isDraft && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTarget(v)}
                  aria-label={`Restore version ${v.version}`}
                >
                  <RotateCcw aria-hidden /> Restore
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <ConfirmDialog
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Restore version ${target?.version}?`}
        description={
          dirty
            ? "Your unsaved changes will be discarded. The current draft stays in History."
            : "It becomes your draft. The current draft stays in History."
        }
        confirmLabel="Restore"
        loading={restore.isPending}
        onConfirm={async () => {
          if (target) await doRestore(target);
          setTarget(null);
        }}
      />
    </PanelSection>
  );
}
