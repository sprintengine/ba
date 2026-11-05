"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, Globe, Wand2 } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useEditSite, useGenerateSite, useSiteVersions } from "@/lib/api/hooks";
import type { SiteAiResult } from "@/lib/api/types";
import { useCurrentBusiness, usePermissions } from "@/lib/business/business-context";
import { aiHistory, canUseSiteAi, EDIT_SUGGESTIONS } from "@/lib/site/ai";
import { formatDateTime } from "@/lib/format";
import { CreditsMeter, CreditsNotice } from "@/components/ai/credits";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiReviewCard } from "./ai-review-card";
import { PanelSection } from "./panel-section";
import { SITE_AI_MUTATION, useEditor } from "./use-site-editor";

/** Generate a whole site, or change it by instruction; every AI change can be kept or undone. */
export function AiPanel() {
  const business = useCurrentBusiness();
  const editor = useEditor();
  const generate = useGenerateSite(business.id, { mutationKey: SITE_AI_MUTATION });
  const edit = useEditSite(business.id, { mutationKey: SITE_AI_MUTATION });
  const [result, setResult] = useState<SiteAiResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const available = canUseSiteAi(editor.site.ai);
  // `aiBusy` too: a call started before this panel was last mounted (another tab and back) is still running.
  const busy = editor.aiBusy || generate.isPending || edit.isPending;

  /** Resolves true when the AI's change landed, false when it failed (the error is shown above). */
  async function run(action: () => Promise<SiteAiResult>): Promise<boolean> {
    setError(null);
    try {
      const res = await action();
      editor.adopt(res.state);
      setResult(res);
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  }
  const runGenerate = (prompt: string, websiteUrl: string) =>
    run(async () => {
      if (editor.dirty) await editor.save();
      return generate.mutateAsync({
        prompt: prompt.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      });
    });
  const runEdit = (instruction: string) =>
    run(async () => {
      const saved = await editor.save();
      return edit.mutateAsync({ instruction, baseVersion: saved.draftVersion });
    });

  return (
    <div className="flex flex-col gap-8">
      <UsageNote />
      {error != null && <AiError error={error} />}
      {result && <AiReviewCard result={result} onDone={() => setResult(null)} />}
      <EditBox busy={edit.isPending} disabled={busy || !available} onSubmit={runEdit} />
      <GenerateBox busy={generate.isPending} disabled={busy || !available} onSubmit={runGenerate} />
      <InstructionHistory />
    </div>
  );
}

function UsageNote() {
  const { site } = useEditor();
  const { model, credits } = site.ai;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-surface-sunken p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <LogoMark className="h-3.5 w-auto" aria-hidden title="" /> AI site builder
        </p>
        <p className="mt-1 text-muted-foreground">
          The AI picks a theme, sections and wording from your real services, team and hours. It never invents
          reviews, prices or claims, and your booking form answers are never shared with it.
          {!model &&
            " No AI model is connected, so our built-in designer is used instead: free and unlimited."}
        </p>
        {model && <CreditsMeter credits={credits} className="mt-3" />}
      </div>
      {model && <CreditsNotice credits={credits} />}
    </div>
  );
}

function AiError({ error }: { error: unknown }) {
  const business = useCurrentBusiness();
  const { manageBilling } = usePermissions();
  const limit = isApiError(error) && error.code === "AI_LIMIT_REACHED";
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-soft p-4 text-sm text-warning-soft-foreground"
    >
      <p className="font-medium">{limit ? "You've used this month's AI credits" : "That didn't work"}</p>
      <p>{errorMessage(error)}</p>
      {limit && manageBilling && (
        <Button asChild size="sm" variant="secondary" className="self-start">
          <Link href={dashboardHref(business.slug, "settings/billing")}>See plans</Link>
        </Button>
      )}
    </div>
  );
}

function EditBox({
  busy,
  disabled,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  onSubmit: (instruction: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  // Enter reaches here even while the AI works (the textarea stays editable), so `disabled` is checked here too. The
  // typed instruction is cleared only once it worked, so a failed one can be sent again.
  const submit = async (value: string, typed: boolean) => {
    if (disabled || !value.trim()) return;
    const ok = await onSubmit(value.trim());
    if (ok && typed) setText("");
  };
  return (
    <PanelSection title="Ask for a change" description="Describe what you'd like, in your own words.">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text, true);
        }}
      >
        <Field label="Your instruction">
          <Textarea
            value={text}
            maxLength={500}
            rows={2}
            placeholder="e.g. Make it warmer and add a FAQ about parking"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(text, true);
              }
            }}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-1.5">
          {EDIT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => void submit(s, false)}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
          <Button
            type="submit"
            size="sm"
            variant="primary"
            className="ml-auto"
            loading={busy}
            disabled={disabled || !text.trim()}
          >
            <ArrowUp aria-hidden /> Apply
          </Button>
        </div>
      </form>
    </PanelSection>
  );
}

function GenerateBox({
  busy,
  disabled,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  onSubmit: (prompt: string, url: string) => Promise<boolean>;
}) {
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <PanelSection
      title="Generate a new design"
      description="Starts over from your business details. Your current draft stays in History."
    >
      <Field label="What should it feel like?" optional>
        <Textarea
          value={prompt}
          maxLength={2000}
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Calm and welcoming, for families"
        />
      </Field>
      <Field
        label="Your current website"
        optional
        help="We read the public page for facts about your business."
      >
        <Input
          value={url}
          type="url"
          leading={<Globe />}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <Button
        variant="brand"
        className="self-start"
        loading={busy}
        disabled={disabled}
        onClick={() => setConfirm(true)}
      >
        <Wand2 aria-hidden /> Generate site
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Replace your draft with a new design?"
        description="Your current draft is kept in History, so you can undo this."
        confirmLabel="Generate"
        loading={busy}
        onConfirm={async () => {
          await onSubmit(prompt, url);
          setConfirm(false);
        }}
      />
    </PanelSection>
  );
}

function InstructionHistory() {
  const business = useCurrentBusiness();
  const versions = useSiteVersions(business.id);
  const items = aiHistory(versions.data?.items ?? []);
  if (items.length === 0) return null;
  return (
    <PanelSection title="Recent AI changes">
      <ol className="flex flex-col gap-3">
        {items.slice(0, 8).map((v) => (
          <li key={v.version} className="rounded-lg border border-border-subtle p-3 text-sm">
            <p className="font-medium">
              {v.instruction ?? (v.source === "ai_generate" ? "Generated a new design" : "AI edit")}
            </p>
            {v.changes.length > 0 && (
              <p className="mt-0.5 line-clamp-2 text-muted-foreground">{v.changes.join(" · ")}</p>
            )}
            <p className="mt-1 text-xs text-subtle-foreground">
              Version {v.version} · {formatDateTime(v.createdAt, business.timezone, business.locale)}
            </p>
          </li>
        ))}
      </ol>
    </PanelSection>
  );
}
