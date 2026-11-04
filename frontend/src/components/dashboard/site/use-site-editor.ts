"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { errorMessage, isApiError } from "@/lib/api/client";
import { usePublishSite, useSaveSite, useSiteState } from "@/lib/api/hooks";
import type { SitePlan, SiteState } from "@/lib/api/types";
import { editPlan, samePlan, type PlanAction } from "@/lib/site/plan-edit";
import { normalizePlan, planIssues, type PlanIssues } from "@/lib/site/plan-validation";

type EditorState = {
  /** The server draft the local plan started from. */
  baseline: SitePlan | null;
  plan: SitePlan | null;
  /** Bumped whenever the plan is replaced from outside (server sync), so forms re-mount. */
  revision: number;
};

type EditorAction =
  | { type: "edit"; action: PlanAction }
  | { type: "sync"; plan: SitePlan; force: boolean }
  /** A save of `sent` finished as `plan`; edits made while it was in flight are kept. */
  | { type: "saved"; sent: SitePlan; plan: SitePlan };

function reducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "edit") {
    return state.plan ? { ...state, plan: editPlan(state.plan, action.action) } : state;
  }
  if (action.type === "saved") {
    if (!samePlan(state.plan, action.sent)) return { ...state, baseline: action.plan };
    return reducer(state, { type: "sync", plan: action.plan, force: true });
  }
  const dirty = !!state.plan && !samePlan(state.plan, state.baseline);
  if (dirty && !action.force) return { ...state, baseline: action.plan };
  if (samePlan(state.plan, action.plan) && samePlan(state.baseline, action.plan)) return state;
  return { baseline: action.plan, plan: action.plan, revision: state.revision + 1 };
}

/** The mutation key of the AI generate and edit calls (AiPanel), so the whole editor can tell one is running. */
export const SITE_AI_MUTATION = ["site-ai"] as const;

const isConflict = (err: unknown) => isApiError(err) && err.code === "CONFLICT";

/** What a failed save says. After a conflict the other draft is already loaded, so saving again goes on top of it. */
export function saveErrorMessage(err: unknown): string {
  return isConflict(err)
    ? "The site was changed elsewhere. Save again to keep your changes, or discard them to see the latest draft."
    : errorMessage(err);
}

export type SiteEditor = {
  site: SiteState;
  plan: SitePlan;
  revision: number;
  dirty: boolean;
  issues: PlanIssues;
  dispatch: (action: PlanAction) => void;
  /** Adopt a server state (after AI changes or a restore), discarding local edits. */
  adopt: (state: SiteState) => void;
  discard: () => void;
  /** Saves local edits (if any); resolves with the saved state. */
  save: () => Promise<SiteState>;
  publish: () => Promise<SiteState>;
  saving: boolean;
  publishing: boolean;
  /** An AI generate or edit is running: its result replaces the draft, so the panels are read-only meanwhile. */
  aiBusy: boolean;
};

/** Loads the site and keeps an editable local copy of the draft. */
export function useSiteEditor(businessId: string) {
  const query = useSiteState(businessId);
  const saveMutation = useSaveSite(businessId);
  const publishMutation = usePublishSite(businessId);
  const [state, send] = useReducer(reducer, { baseline: null, plan: null, revision: 0 });

  const serverDraft = query.data?.draft;
  useEffect(() => {
    if (serverDraft) send({ type: "sync", plan: serverDraft, force: false });
  }, [serverDraft]);

  const dispatch = useCallback((action: PlanAction) => send({ type: "edit", action }), []);
  const adopt = useCallback((s: SiteState) => send({ type: "sync", plan: s.draft, force: true }), []);

  const site = query.data;
  const plan = state.plan;
  const baseline = state.baseline;
  // samePlan serialises both plans: once per change, not once per render.
  const dirty = useMemo(() => !!plan && !samePlan(plan, baseline), [plan, baseline]);
  const issues = useMemo(
    () => (plan ? planIssues(plan) : { count: 0, sections: {}, palette: {}, seo: {} }),
    [plan],
  );

  // One save at a time: a second one (⌘S twice, Save then Publish, an AI call) would send the same base version and
  // be refused as a conflict, so it shares the save in flight instead.
  const inFlight = useRef<Promise<SiteState> | null>(null);
  const { refetch } = query;
  const { mutateAsync: saveSite, isPending: saving } = saveMutation;
  const { mutateAsync: publishSite, isPending: publishing } = publishMutation;
  const aiBusy = useIsMutating({ mutationKey: SITE_AI_MUTATION }) > 0;
  const save = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    if (!site || !plan) return Promise.reject(new Error("Site not loaded"));
    if (!dirty && site.draftVersion != null) return Promise.resolve(site);
    const request = saveSite({ plan: normalizePlan(plan), baseVersion: site.draftVersion })
      .then(
        (saved) => {
          send({ type: "saved", sent: plan, plan: saved.draft });
          return saved;
        },
        (err: unknown) => {
          // Someone else saved first: load their draft as the new base (the local edits stay, still unsaved), so
          // the next save goes on top of it instead of failing the same way.
          if (isConflict(err)) void refetch();
          throw err;
        },
      )
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [site, plan, dirty, saveSite, refetch]);

  const publish = useCallback(async () => {
    await save();
    return publishSite();
  }, [save, publishSite]);

  // One value per change, so the panels and preview under the provider don't re-render with every parent render.
  const revision = state.revision;
  const editor = useMemo<SiteEditor | null>(
    () =>
      site && plan
        ? {
            site,
            plan,
            revision,
            dirty,
            issues,
            dispatch,
            adopt,
            discard: () => adopt(site),
            save,
            publish,
            saving,
            publishing,
            aiBusy,
          }
        : null,
    [site, plan, revision, dirty, issues, dispatch, adopt, save, publish, saving, publishing, aiBusy],
  );
  return { query, editor };
}

const EditorContext = createContext<SiteEditor | null>(null);
export const SiteEditorProvider = EditorContext.Provider;

export function useEditor(): SiteEditor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditor must be used inside <SiteEditorProvider>");
  return editor;
}
