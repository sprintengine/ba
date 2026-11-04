"use client";

import { useState } from "react";
import { ArrowRight, Wand2 } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import {
  useBusiness,
  useGenerateSite,
  usePublicServices,
  usePublishSite,
  useSaveSite,
  useSiteState,
} from "@/lib/api/hooks";
import type { SiteThemeKey } from "@/lib/api/types";
import { ErrorState } from "@/components/common/feedback";
import { ScaledFrame } from "@/components/site/scaled-frame";
import { SiteRenderer } from "@/components/site/site-renderer";
import { ThemePicker } from "@/components/site/theme-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { CreatedBusiness } from "./draft-storage";
import { PUBLIC_HOST } from "./slug-field";

/**
 * "Your site" (after the business is created): pick a theme with live thumbnails of the owner's
 * own site, or generate one with AI from the description, then publish. Skippable: without it the
 * public page uses the default design for the industry.
 */
export function SiteStep({ created, onDone }: { created: CreatedBusiness; onDone: () => void }) {
  const business = useBusiness(created.id);
  const services = usePublicServices(created.slug);
  const site = useSiteState(created.id);
  const save = useSaveSite(created.id);
  const publish = usePublishSite(created.id);
  const generate = useGenerateSite(created.id);
  const [theme, setTheme] = useState<SiteThemeKey | null>(null);

  if (site.isError) return <ErrorState error={site.error} onRetry={() => site.refetch()} />;
  if (!business.data || !services.data || !site.data) return <SiteStepSkeleton />;

  const plan = { ...site.data.draft, theme: theme ?? site.data.draft.theme };
  const busy = save.isPending || publish.isPending || generate.isPending;

  const generateWithAi = async () => {
    try {
      const result = await generate.mutateAsync({ prompt: business.data.description ?? undefined });
      setTheme(null);
      toast.success(
        result.source === "ai" ? "Here's a design made for you" : "Here's a design for your business",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const publishSite = async () => {
    try {
      await save.mutateAsync({ plan, baseVersion: site.data.draftVersion });
      await publish.mutateAsync();
      toast.success("Your site is live");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl animate-rise flex-col gap-8">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Your site</h1>
        <p className="mx-auto max-w-xl text-pretty text-muted-foreground">
          Customers land on{" "}
          <span className="font-mono text-foreground">
            {PUBLIC_HOST}/{created.slug}
          </span>
          . Pick a look, or let AI design it from your description. You can change everything later.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ThemePicker
            value={plan.theme}
            onChange={setTheme}
            plan={plan}
            business={business.data}
            services={services.data}
            context={site.data.context}
          />
          <Button
            variant="secondary"
            loading={generate.isPending}
            disabled={busy}
            onClick={() => void generateWithAi()}
          >
            <Wand2 aria-hidden /> Generate with AI
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Preview</p>
          {/* A section, so the rendered site's header and footer don't become page landmarks. */}
          <section
            aria-label="Site preview"
            className="h-[30rem] scrollbar-thin overflow-y-auto rounded-2xl border border-border shadow-sm"
          >
            <ScaledFrame width={1280} className="pointer-events-none">
              <SiteRenderer
                plan={plan}
                business={business.data}
                services={services.data}
                context={site.data.context}
                mode="preview"
              />
            </ScaledFrame>
          </section>
        </div>
      </div>
      <div className="flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          Skip for now
        </Button>
        <Button
          variant="primary"
          size="lg"
          loading={save.isPending || publish.isPending}
          disabled={busy}
          onClick={() => void publishSite()}
        >
          Publish my site <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function SiteStepSkeleton() {
  return (
    <div
      role="status"
      aria-busy
      aria-label="Loading"
      className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2"
    >
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[30rem] rounded-2xl" />
    </div>
  );
}
