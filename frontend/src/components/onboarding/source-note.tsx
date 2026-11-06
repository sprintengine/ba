"use client";

import { AiBadge } from "@/components/brand/logo";
import { useTemplates } from "@/lib/api/hooks";
import type { BusinessSetup } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import type { DraftOrigin } from "./draft-storage";

/** Where the draft came from: an AI draft, or a template (picked, or matched when AI isn't configured). */
export function SourceNote({ setup, origin }: { setup: BusinessSetup; origin: DraftOrigin }) {
  const templates = useTemplates();
  const templateKey = origin.kind === "template" ? origin.key : setup.industry;
  const templateName =
    templates.data?.find((t) => t.key === templateKey)?.name ?? templateKey.replace(/_/g, " ");
  if (origin.kind === "ai" && setup.source === "ai") {
    return (
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <AiBadge className="text-sm font-medium text-foreground">Drafted by AI</AiBadge>
        <span>Double-check prices and hours.</span>
      </p>
    );
  }
  if (origin.kind === "ai") {
    return (
      <p className="min-w-0 text-sm text-muted-foreground">
        <Badge tone="neutral" className="mr-2">
          Template
        </Badge>
        Started from the <span className="font-medium text-foreground">{templateName}</span> template. AI
        isn&rsquo;t configured here, so we matched your description.
      </p>
    );
  }
  return (
    <p className="min-w-0 text-sm text-muted-foreground">
      <Badge tone="neutral" className="mr-2">
        Template
      </Badge>
      Started from the <span className="font-medium text-foreground">{templateName}</span> template.
    </p>
  );
}
