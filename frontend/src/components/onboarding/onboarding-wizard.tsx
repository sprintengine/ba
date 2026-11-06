"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTemplate } from "@/lib/api/hooks";
import type { BusinessSetup } from "@/lib/api/types";
import { createDraft } from "@/lib/onboarding/draft";
import { DescribeStep, type DescribeValues } from "./describe-step";
import { clearOnboarding, saveOnboarding, takeDescription, type DraftOrigin } from "./draft-storage";
import { ReviewStep } from "./review-step";
import { LookStep } from "./look-step";
import { StartStep } from "./start-step";
import { SuccessStep } from "./success-step";
import { WizardProgress } from "./wizard-progress";
import {
  initialWizardState,
  WIZARD_PROGRESS,
  wizardView,
  type WizardState,
  type WizardView,
} from "./wizard-state";

/**
 * /onboarding: Start (describe with AI, or pick a template) → Review & edit → Create → Look (booking page style, or the
 * site where websites are on) → Success.
 * `?template=physio` jumps straight to reviewing that template.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const templateParam = searchParams.get("template");
  const [state, setState] = useState<WizardState>(() => initialWizardState(templateParam));
  const [aiInput, setAiInput] = useState<DescribeValues>({ description: "", websiteUrl: "" });

  // Consume ?template= so a refresh restores the (edited) draft rather than the pristine template.
  useEffect(() => {
    if (templateParam) router.replace(pathname, { scroll: false });
  }, [templateParam, router, pathname]);

  // Words typed on the home page before signing up open the describe step, already filled in.
  useEffect(() => {
    const description = takeDescription();
    if (!description || state.step !== "start") return;
    const website = /^(https?:\/\/|www\.)\S+$/i.test(description);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAiInput(website ? { description: "", websiteUrl: description } : { description, websiteUrl: "" });
    setState({ step: "describe" });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateKey = state.step === "template" ? state.key : "";
  const template = useTemplate(templateKey, { retry: false });

  // Remember the site and success screens across a refresh, but not once the owner moves on.
  const createdStep = state.step === "site" || state.step === "success" ? state.step : null;
  const createdBusiness = state.step === "site" || state.step === "success" ? state.business : null;
  useEffect(() => {
    if (!createdBusiness || !createdStep) return;
    saveOnboarding({ step: createdStep, business: createdBusiness });
    return () => clearOnboarding();
  }, [createdBusiness, createdStep]);

  // Each step starts at the top of the page.
  const stepName = state.step === "template" && template.data ? "review" : state.step;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stepName]);

  function toReview(setup: BusinessSetup, origin: DraftOrigin) {
    setState({ step: "review", draft: createDraft(setup), origin, id: Date.now() });
  }

  function startOver() {
    clearOnboarding();
    setState({ step: "start" });
  }

  const view = wizardView(state, template);
  const progress = WIZARD_PROGRESS[view.step];
  const content = renderStep(view);

  function renderStep(v: WizardView): React.ReactNode {
    switch (v.step) {
      case "start":
        return (
          <StartStep
            onDescribe={() => setState({ step: "describe" })}
            onPickTemplate={(key) => setState({ step: "template", key })}
            pendingTemplate={v.pendingTemplate}
            templateError={v.templateError}
          />
        );
      case "describe":
        return (
          <DescribeStep
            initial={aiInput}
            onBack={() => setState({ step: "start" })}
            onDraft={(setup, values) => {
              setAiInput(values);
              toReview(setup, { kind: "ai" });
            }}
          />
        );
      case "review":
        return (
          <ReviewStep
            key={v.reviewKey}
            initialDraft={v.draft}
            origin={v.origin}
            onStartOver={startOver}
            onCreated={(business) => setState({ step: "site", business })}
          />
        );
      case "site":
        return (
          <LookStep created={v.business} onDone={() => setState({ step: "success", business: v.business })} />
        );
      case "success":
        return <SuccessStep business={v.business} onLeave={clearOnboarding} />;
    }
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <WizardProgress
        current={progress}
        className={progress === 1 ? "lg:max-w-[calc(100%-22.5rem)]" : "mx-auto max-w-3xl"}
      />
      {content}
    </div>
  );
}
