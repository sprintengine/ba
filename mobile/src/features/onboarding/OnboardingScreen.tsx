import { zodResolver } from "@hookform/resolvers/zod";
import { router, Stack, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "react-native";
import { useAiBusinessDraft } from "@shared/api/hooks/use-onboarding";
import type { BusinessSetup } from "@shared/api/types";
import { useAuth } from "@shared/auth/context";
import type { SetupAction } from "@shared/onboarding/actions";
import { setupReducer } from "@shared/onboarding/setup-reducer";
import { Screen, useToast } from "~/ui";
import { confirmAction, HeaderButton, hapticSuccess } from "~/ui/form";
import { clearDraft, loadDraft, saveDraft } from "./draft-storage";
import { DescribeStep } from "./DescribeStep";
import { AiDrafting, TemplateLoading } from "./DraftingStep";
import { ReviewStep } from "./ReviewStep";
import { SuccessStep } from "./SuccessStep";
import {
  aiDraftInput,
  describeSchema,
  draftFrom,
  EMPTY_DESCRIBE,
  STEP_TITLE,
  type CreatedBusiness,
  type DescribeValues,
  type DraftOrigin,
  type WizardState,
  type WizardStep,
} from "./wizard";

type LeaveChoice = "stay" | "keep" | "discard";

/** Asks before leaving the wizard: a draft being reviewed can be kept on the phone for later. */
function askToLeave(step: WizardStep): Promise<LeaveChoice> {
  if (step !== "review") {
    return confirmAction({
      title: "Discard this business?",
      message: "What you've entered so far will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      destructive: true,
    }).then((discard) => (discard ? "discard" : "stay"));
  }
  return new Promise((resolve) => {
    Alert.alert(
      "Leave setup?",
      "Keep this draft on this phone to finish later, or discard it.",
      [
        { text: "Keep editing", style: "cancel", onPress: () => resolve("stay") },
        { text: "Save for later", onPress: () => resolve("keep") },
        { text: "Discard draft", style: "destructive", onPress: () => resolve("discard") },
      ],
      { cancelable: true, onDismiss: () => resolve("stay") },
    );
  });
}

/**
 * `/onboarding` (the website's OnboardingWizard), a full-screen modal over the app: describe the business (or pick a
 * template) → the AI draft → review and edit the essentials → create → open the new business's dashboard. No plan or
 * payment step: a new business starts on its free plan, and plans are managed on the website. The draft being
 * reviewed is kept on the phone (`draft-storage`) until it's created or discarded.
 */
export function OnboardingScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const navigation = useNavigation();
  const toast = useToast();
  const [state, setState] = useState<WizardState>(() => {
    const saved = loadDraft(userId);
    return saved ? { step: "review", ...saved } : { step: "describe" };
  });
  const form = useForm<DescribeValues>({
    resolver: zodResolver(describeSchema),
    defaultValues: EMPTY_DESCRIBE,
  });
  const aiDraft = useAiBusinessDraft();
  const attempt = useRef(0);

  // A draft left from last time: say so once.
  const resumed = useRef(state.step === "review");
  useEffect(() => {
    if (resumed.current) toast.show("Picked up your draft where you left off");
    resumed.current = false;
  }, [toast]);

  // Keep the draft being reviewed across leaving the wizard or the app closing.
  useEffect(() => {
    if (state.step === "review") saveDraft(userId, { draft: state.draft, origin: state.origin });
  }, [state, userId]);

  const dirty =
    state.step === "drafting" ||
    state.step === "review" ||
    (state.step === "describe" && form.formState.isDirty);

  usePreventRemove(dirty, ({ data }) => {
    void askToLeave(state.step).then((choice) => {
      if (choice === "stay") return;
      if (choice === "discard") clearDraft();
      navigation.dispatch(data.action);
    });
  });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const toReview = (setup: BusinessSetup, origin: DraftOrigin): WizardState => ({
    step: "review",
    draft: draftFrom(setup, form.getValues("name")),
    origin,
  });

  const requestDraft = () => {
    const id = ++attempt.current;
    setState({ step: "drafting", source: { kind: "ai", attempt: id } });
    aiDraft.mutate(aiDraftInput(form.getValues()), {
      onSuccess: (setup) =>
        setState((s) =>
          s.step === "drafting" && s.source.kind === "ai" && s.source.attempt === id
            ? toReview(setup, { kind: "ai" })
            : s,
        ),
    });
  };

  const pickTemplate = (key: string) => setState({ step: "drafting", source: { kind: "template", key } });

  const templateLoaded = (key: string) => (setup: BusinessSetup) =>
    setState((s) =>
      s.step === "drafting" && s.source.kind === "template" && s.source.key === key
        ? toReview(setup, { kind: "template", key })
        : s,
    );

  const dispatch = (action: SetupAction) =>
    setState((s) => (s.step === "review" ? { ...s, draft: setupReducer(s.draft, action) } : s));

  const created = (business: CreatedBusiness) => {
    clearDraft();
    hapticSuccess();
    setState({ step: "success", business });
  };

  const startOver = () => {
    clearDraft();
    setState({ step: "describe" });
  };

  return (
    <Screen testID="onboarding">
      <Stack.Screen
        options={{
          title: STEP_TITLE[state.step],
          headerLeft: () =>
            state.step === "success" ? null : (
              <HeaderButton label="Cancel" testID="onboarding-cancel" onPress={close} />
            ),
        }}
      />
      {state.step === "describe" ? (
        <DescribeStep form={form} onDraft={requestDraft} onPickTemplate={pickTemplate} />
      ) : state.step === "drafting" && state.source.kind === "ai" ? (
        <AiDrafting
          key={state.source.attempt}
          description={form.getValues("description")}
          error={aiDraft.error}
          onRetry={requestDraft}
          onBack={() => setState({ step: "describe" })}
        />
      ) : state.step === "drafting" && state.source.kind === "template" ? (
        <TemplateLoading
          templateKey={state.source.key}
          onLoaded={templateLoaded(state.source.key)}
          onBack={() => setState({ step: "describe" })}
        />
      ) : state.step === "review" ? (
        <ReviewStep
          draft={state.draft}
          origin={state.origin}
          dispatch={dispatch}
          onStartOver={startOver}
          onCreated={created}
        />
      ) : state.step === "success" ? (
        <SuccessStep
          business={state.business}
          onOpen={() => router.replace(`/dashboard/${state.business.slug}`)}
        />
      ) : null}
    </Screen>
  );
}
