"use client";

import { useState } from "react";
import { Check, Info, Undo2 } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useRestoreSiteVersion } from "@/lib/api/hooks";
import type { SiteAiResult } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useEditor } from "./use-site-editor";

/** What the AI just changed, with Keep or Undo (undo restores the previous draft version). */
export function AiReviewCard({ result, onDone }: { result: SiteAiResult; onDone: () => void }) {
  const business = useCurrentBusiness();
  const { adopt, dirty } = useEditor();
  const restore = useRestoreSiteVersion(business.id);
  // Undo replaces the draft with the version before the AI's change: edits made since would go with it, so ask first.
  const [confirming, setConfirming] = useState(false);
  const changed = result.changes.length > 0;
  const undo = async () => {
    if (result.previousVersion == null) return;
    try {
      adopt(await restore.mutateAsync(result.previousVersion));
      toast.success("Change undone");
      setConfirming(false);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <section
      aria-label="AI changes"
      className="flex animate-rise flex-col gap-3 rounded-xl border border-brand-border bg-brand-soft/50 p-4"
    >
      <p className="text-sm font-semibold">{changed ? "Here's what changed" : "Nothing changed"}</p>
      {result.message && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {result.message}
        </p>
      )}
      {changed && (
        <ul className="flex flex-col gap-1 text-sm">
          {result.changes.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
              {c}
            </li>
          ))}
        </ul>
      )}
      {result.source === "template" && changed && (
        <p className="text-xs text-muted-foreground">
          Made with the built-in designer (no AI model was used).
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onDone}>
          <Check aria-hidden /> {changed ? "Keep" : "OK"}
        </Button>
        {changed && result.previousVersion != null && (
          <Button
            size="sm"
            loading={restore.isPending}
            onClick={() => (dirty ? setConfirming(true) : void undo())}
          >
            <Undo2 aria-hidden /> Undo
          </Button>
        )}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Undo the AI's change?"
          description="Your draft goes back to how it was before. The edits you've made since then will be lost too."
          confirmLabel="Undo"
          destructive
          loading={restore.isPending}
          onConfirm={undo}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Changes are saved to your draft. Publish when you&apos;re happy.
      </p>
    </section>
  );
}
