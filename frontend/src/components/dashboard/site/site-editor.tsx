"use client";

import { useEffect, useState } from "react";
import { CircleAlert, ExternalLink, Eye } from "lucide-react";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { formatDateTime } from "@/lib/format";
import { useUnsavedChangesGuard } from "@/lib/hooks/use-unsaved-changes-guard";
import { ErrorState, NoAccess } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { AiPanel } from "./ai-panel";
import { DesignPanel } from "./design-panel";
import { HistoryPanel } from "./history-panel";
import { SectionsPanel } from "./sections-panel";
import { SitePreview } from "./site-preview";
import { saveErrorMessage, SiteEditorProvider, useSiteEditor, type SiteEditor } from "./use-site-editor";

const TABS = ["design", "sections", "ai", "history"] as const;
type Tab = (typeof TABS)[number];

/** /dashboard/[slug]/site: edit, preview and publish the business's site (owner/admin). */
export function SiteEditorPage() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  if (!business.sitesEnabled) {
    return (
      <NoAccess
        title="Your booking page is set up in Branding"
        description="Change its colour, logo and style there."
        backHref={dashboardHref(business.slug, "settings/branding")}
        backLabel="Open Branding"
      />
    );
  }
  if (!perms.manageSite) {
    return (
      <NoAccess
        title="The site is edited by owners and admins"
        description="Ask an owner or admin of this business to change the site."
        backHref={dashboardHref(business.slug)}
        backLabel="Back to overview"
      />
    );
  }
  return <SiteEditorLoader businessId={business.id} />;
}

function SiteEditorLoader({ businessId }: { businessId: string }) {
  const { query, editor } = useSiteEditor(businessId);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!editor) return <EditorSkeleton />;
  return (
    <SiteEditorProvider value={editor}>
      <EditorLayout editor={editor} />
    </SiteEditorProvider>
  );
}

function EditorLayout({ editor }: { editor: SiteEditor }) {
  const { params, setParams } = useUrlParams();
  const initialTab = params.get("tab");
  const [tab, setTabState] = useState<Tab>(
    (TABS as readonly string[]).includes(initialTab ?? "") ? (initialTab as Tab) : "design",
  );
  // The tab lives in local state (instant) and is mirrored to the URL so it can be shared.
  const setTab = (t: string) => {
    setTabState(t as Tab);
    setParams({ tab: t });
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");

  const selectFromPreview = (id: string) => {
    setSelectedId(id);
    setTab("sections");
  };

  useSaveShortcut(editor);
  useUnsavedChangesGuard(editor.dirty);

  return (
    <PageContainer size="full" className="flex flex-col gap-4 lg:gap-6">
      <EditorHeader editor={editor} />
      <SegmentedControl
        className="self-start lg:hidden"
        aria-label="Editor view"
        value={view}
        onValueChange={setView}
        options={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(22rem,27rem)_minmax(0,1fr)]">
        <div className={cn("min-w-0", view === "preview" && "max-lg:hidden")}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Site editor">
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            {editor.aiBusy && tab !== "ai" && (
              <p
                role="status"
                className="mt-4 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-muted-foreground"
              >
                The AI is changing your site. Editing is paused until it&apos;s done.
              </p>
            )}
            <TabsContent value="design">
              <AiLock busy={editor.aiBusy}>
                <DesignPanel />
              </AiLock>
            </TabsContent>
            <TabsContent value="sections">
              <AiLock busy={editor.aiBusy}>
                <SectionsPanel selectedId={selectedId} onSelect={setSelectedId} />
              </AiLock>
            </TabsContent>
            <TabsContent value="ai">
              <AiPanel />
            </TabsContent>
            <TabsContent value="history">
              <AiLock busy={editor.aiBusy}>
                <HistoryPanel />
              </AiLock>
            </TabsContent>
          </Tabs>
        </div>
        <SitePreview
          selectedId={selectedId}
          onSelect={selectFromPreview}
          className={cn(
            "h-[70dvh] lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)]",
            view === "edit" && "max-lg:hidden",
          )}
        />
      </div>
    </PageContainer>
  );
}

function EditorHeader({ editor }: { editor: SiteEditor }) {
  const { business } = useBusinessContext();
  const { site, dirty, issues } = editor;
  const save = async () => {
    try {
      await editor.save();
      toast.success("Draft saved");
    } catch (err) {
      toast.error(saveErrorMessage(err));
    }
  };
  const publish = async () => {
    try {
      await editor.publish();
      toast.success("Your site is live", {
        action: { label: "View", onClick: () => window.open(`/${business.slug}`, "_blank", "noopener") },
      });
    } catch (err) {
      toast.error(saveErrorMessage(err));
    }
  };
  const status = dirty ? (
    <Badge tone="warning" dot>
      Unsaved changes
    </Badge>
  ) : site.hasUnpublishedChanges || !site.published ? (
    <Badge tone="info" dot>
      Draft not published
    </Badge>
  ) : (
    <Badge tone="success" dot>
      Published
    </Badge>
  );
  return (
    <PageHeader
      className="max-lg:pb-2"
      title="Site"
      description={
        <span className="flex flex-wrap items-center gap-2">
          {status}
          {site.publishedAt && (
            <span className="text-sm text-muted-foreground">
              Last published {formatDateTime(site.publishedAt, business.timezone, business.locale)}
            </span>
          )}
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {issues.count > 0 && (
            <span className="inline-flex items-center gap-1 text-sm text-danger">
              <CircleAlert className="size-4" aria-hidden /> {issues.count} to fix
            </span>
          )}
          <ActionButton
            variant="ghost"
            href={`/${business.slug}`}
            newTab
            icon={<ExternalLink aria-hidden />}
            label="View site"
          />
          {site.draftVersion != null && (
            <ActionButton
              variant="ghost"
              href={`/${business.slug}?site=draft`}
              newTab
              icon={<Eye aria-hidden />}
              label="Preview draft"
            />
          )}
          {dirty && (
            <Button variant="ghost" disabled={editor.aiBusy} onClick={editor.discard}>
              Discard
            </Button>
          )}
          <Button
            loading={editor.saving && !editor.publishing}
            disabled={!dirty || issues.count > 0 || editor.aiBusy}
            onClick={() => void save()}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            loading={editor.publishing}
            disabled={
              editor.saving ||
              editor.aiBusy ||
              issues.count > 0 ||
              (!dirty && !site.hasUnpublishedChanges && !!site.published)
            }
            onClick={() => void publish()}
          >
            Publish
          </Button>
        </div>
      }
    />
  );
}

/**
 * Read-only while the AI works: its result replaces the whole draft, so an edit made meanwhile would be lost. A
 * disabled fieldset disables every control inside it.
 */
function AiLock({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <fieldset disabled={busy} aria-busy={busy || undefined} className="min-w-0">
      {children}
    </fieldset>
  );
}

/** ⌘S / Ctrl+S saves the draft. */
function useSaveShortcut(editor: SiteEditor) {
  const { dirty, issues, save } = editor;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && issues.count === 0)
          save().then(
            () => toast.success("Draft saved"),
            (err: unknown) => toast.error(saveErrorMessage(err)),
          );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, issues.count, save]);
}

function EditorSkeleton() {
  return (
    <PageContainer size="full" className="flex flex-col gap-6">
      <Skeleton className="h-9 w-40" aria-label="Loading site editor" />
      <div className="grid gap-6 lg:grid-cols-[27rem_1fr]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[70dvh] rounded-2xl" />
      </div>
    </PageContainer>
  );
}
