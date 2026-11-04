"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import { useCreateBusiness, useMe } from "@/lib/api/hooks";
import { errorMessage, isApiError } from "@/lib/api/client";
import { qk } from "@/lib/api/query-keys";
import type { SetupAction } from "@/lib/onboarding/actions";
import { createdBusinessIn, toCreateInput } from "@/lib/onboarding/draft";
import { describeProblem, type SetupProblem } from "@/lib/onboarding/problems";
import { setupReducer } from "@/lib/onboarding/setup-reducer";
import { hasPaidServices } from "@/lib/onboarding/summary";
import type { SetupDraft, SetupErrors } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BusinessSection } from "./business-section";
import { saveOnboarding, type CreatedBusiness, type DraftOrigin } from "./draft-storage";
import { GroupsSection, QuestionsSection } from "./groups-questions-sections";
import { ReadyPanel } from "./ready-panel";
import { ResourcesSection } from "./resources-section";
import { ServicesSection } from "./services-section";
import { SourceNote } from "./source-note";
import { useSetupValidation } from "./use-setup-validation";

export function ReviewStep({
  initialDraft,
  origin,
  onStartOver,
  onCreated,
}: {
  initialDraft: SetupDraft;
  origin: DraftOrigin;
  onStartOver: () => void;
  onCreated: (business: CreatedBusiness) => void;
}) {
  const [draft, rawDispatch] = useReducer(setupReducer, initialDraft);
  const [serverErrors, setServerErrors] = useState<SetupErrors>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [openGroups, setOpenGroups] = useState(false);
  const [openQuestions, setOpenQuestions] = useState(false);
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<number | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const create = useCreateBusiness();
  const me = useMe();
  const setup = draft.setup;

  // Keep the draft across refreshes.
  useEffect(() => {
    saveOnboarding({ step: "review", draft, origin });
  }, [draft, origin]);

  // The businesses the user had before creating this one, to recognise it if a create's response is lost.
  const knownBusinessIds = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!knownBusinessIds.current && me.data)
      knownBusinessIds.current = new Set(me.data.memberships.map((m) => m.businessId));
  }, [me.data]);

  /** The business an earlier create made although its response never arrived, from a fresh /v1/me. */
  async function createdEarlier() {
    const known = knownBusinessIds.current;
    if (!known) return null;
    const { data } = await me.refetch();
    return data ? createdBusinessIn(data, known, toCreateInput(setup).slug) : null;
  }

  const dispatch = (action: SetupAction) => {
    rawDispatch(action);
    setServerErrors({});
    setRootError(null);
  };

  const { errors, problems, slugCheck } = useSetupValidation(setup, serverErrors);
  const [firstProblem] = problems;

  function jumpTo(problem: SetupProblem) {
    if (problem.section === "groups") setOpenGroups(true);
    if (problem.section === "questions") {
      setOpenQuestions(true);
      if (problem.index !== null) setExpandedQuestion(problem.index);
    }
    if (problem.section === "resources" && problem.index !== null)
      setExpandedResource(setup.resources[problem.index]?.key ?? null);
    if (problem.section === "services" && problem.index !== null) setExpandedService(problem.index);
    const targetId =
      problem.index !== null ? `item-${problem.section}-${problem.index}` : `section-${problem.section}`;
    // Wait for the section/item to render open, then scroll and focus the first invalid control.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(targetId);
        if (!el) return;
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        el.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus({ preventScroll: true });
      }),
    );
  }

  async function submit() {
    setAttempted(true);
    setRootError(null);
    if (firstProblem) {
      jumpTo(firstProblem);
      return;
    }
    try {
      const business = await create.mutateAsync(toCreateInput(setup));
      onCreated({
        id: business.id,
        slug: business.slug,
        name: business.name,
        primaryColor: business.branding.primaryColor,
        hasPaidServices: hasPaidServices(setup),
      });
    } catch (err) {
      // A retry after a lost response finds the address taken by the business that response was for.
      const lost = isApiError(err) && (err.code === "SLUG_TAKEN" || err.isUnavailable);
      const created = lost ? await createdEarlier() : null;
      if (created) {
        onCreated({
          id: created.businessId,
          slug: created.slug,
          name: created.name,
          primaryColor: created.branding.primaryColor,
          hasPaidServices: hasPaidServices(setup),
        });
      } else if (isApiError(err) && err.code === "SLUG_TAKEN") {
        setServerErrors({ slug: err.fields.slug ?? "That address was just taken. Try another." });
        void queryClient.invalidateQueries({ queryKey: qk.onboarding.slugAvailable(setup.slug ?? "") });
        jumpTo(describeProblem(setup, "slug", ""));
      } else if (isApiError(err) && Object.keys(err.fields).length > 0) {
        setServerErrors(err.fields);
        setRootError(err.message);
      } else {
        setRootError(errorMessage(err));
      }
    }
  }

  const sidebar = (
    <ReadyPanel
      setup={setup}
      problems={problems}
      attempted={attempted}
      rootError={rootError}
      creating={create.isPending}
      checkingSlug={slugCheck.status === "checking"}
      onJump={jumpTo}
      onCreate={submit}
    />
  );

  return (
    <div className="animate-rise">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <SourceNote setup={setup} origin={origin} />
              <Button
                variant="ghost"
                size="sm"
                className="-mr-2 shrink-0 text-muted-foreground"
                onClick={() => setConfirmStartOver(true)}
                aria-label="Start over"
              >
                <RotateCcw />
                <span className="hidden sm:inline">Start over</span>
              </Button>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Review your business</h1>
            <p className="text-base text-pretty text-muted-foreground">
              Check the details below. Open anything to change it; you can edit all of this later from your
              dashboard too.
            </p>
          </header>

          <BusinessSection
            setup={setup}
            errors={errors}
            slugEdited={draft.slugEdited}
            slugCheck={slugCheck}
            dispatch={dispatch}
          />
          <ResourcesSection
            setup={setup}
            errors={errors}
            expandedKey={expandedResource}
            onExpand={setExpandedResource}
            dispatch={dispatch}
          />
          <ServicesSection
            setup={setup}
            errors={errors}
            expandedIndex={expandedService}
            onExpand={setExpandedService}
            dispatch={dispatch}
          />
          <GroupsSection
            setup={setup}
            errors={errors}
            open={openGroups}
            onOpenChange={setOpenGroups}
            dispatch={dispatch}
          />
          <QuestionsSection
            setup={setup}
            errors={errors}
            open={openQuestions}
            onOpenChange={setOpenQuestions}
            expandedIndex={expandedQuestion}
            onExpand={setExpandedQuestion}
            dispatch={dispatch}
          />

          {/* Mobile / tablet: the ready panel sits at the end of the page... */}
          <div className="lg:hidden">{sidebar}</div>
        </div>

        <aside className="hidden lg:block" aria-label="Summary">
          <div className="sticky top-24">{sidebar}</div>
        </aside>
      </div>

      {/* ...and a slim sticky bar keeps Create reachable while scrolling on small screens. */}
      <MobileCreateBar
        problemCount={problems.length}
        creating={create.isPending}
        onJump={firstProblem ? () => jumpTo(firstProblem) : undefined}
        onCreate={submit}
      />

      <ConfirmDialog
        open={confirmStartOver}
        onOpenChange={setConfirmStartOver}
        title="Start over?"
        description="This draft and your edits will be discarded."
        confirmLabel="Discard draft"
        destructive
        onConfirm={() => {
          setConfirmStartOver(false);
          onStartOver();
        }}
      />
    </div>
  );
}

/** Small screens: the problem count (jumps to the first) and Create, pinned to the bottom. */
function MobileCreateBar({
  problemCount,
  creating,
  onJump,
  onCreate,
}: {
  problemCount: number;
  creating: boolean;
  onJump: (() => void) | undefined;
  onCreate: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-border bg-background/85 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:-mx-8 sm:px-8 lg:hidden">
      <div className="flex items-center gap-3">
        {onJump ? (
          <button
            type="button"
            onClick={onJump}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm font-medium text-danger-soft-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span>{problemCount === 1 ? "1 thing to fix" : `${problemCount} things to fix`}</span>
          </button>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
            <span>Ready to create</span>
          </p>
        )}
        <Button variant="primary" onClick={onCreate} loading={creating}>
          Create business
        </Button>
      </div>
    </div>
  );
}
