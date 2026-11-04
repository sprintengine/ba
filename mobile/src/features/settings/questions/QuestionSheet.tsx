import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { FormQuestion, Service } from "@shared/api/types";
import { useCreateQuestion, useDeleteQuestion, useUpdateQuestion } from "@shared/api/hooks/use-business";
import { useBusinessContext } from "@shared/business/business-context";
import { QUESTION_KINDS } from "@shared/catalog/questions";
import { renameFieldErrors } from "@shared/settings/api-fields";
import {
  ALL_SERVICES,
  formValuesToQuestionInput,
  KIND_LABEL,
  questionSchema,
  questionToFormValues,
  type QuestionFormValues as V,
} from "@shared/settings/question-form";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Sheet, Text } from "~/ui";
import {
  applyApiErrors,
  confirmAction,
  confirmDiscard,
  FormRootError,
  FormSelect,
  FormSwitch,
  FormTextField,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";

/**
 * Add or edit a booking question (the website's QuestionDialog): the question, a hint, the answer type (choices for a
 * Choice), which service it's asked for, required, sensitive, and active for an existing one. Editing also offers
 * deleting it (the website's row action).
 */
export function QuestionSheet({
  question,
  nextSort,
  defaultService,
  services,
  onClose,
}: {
  question: FormQuestion | null;
  nextSort: number;
  /** A new question's "Ask for" (the filtered service, else all services). */
  defaultService: string;
  services: readonly Service[];
  onClose: () => void;
}) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const create = useCreateQuestion(business.id);
  const update = useUpdateQuestion(business.id);
  const remove = useDeleteQuestion(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<V>({
    resolver: zodResolver(questionSchema),
    defaultValues: questionToFormValues(question, defaultService),
  });
  const { isDirty, isSubmitting } = form.formState;
  const { leave } = useUnsavedChangesGuard(isDirty);
  const kind = useWatch({ control: form.control, name: "kind" });

  const close = async () => {
    if (isDirty && !(await confirmDiscard())) return;
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    const input = formValuesToQuestionInput(values, question?.sortOrder ?? nextSort);
    try {
      if (question) await update.mutateAsync({ id: question.id, input });
      else await create.mutateAsync(input);
      feedback.saved(question ? "Question saved" : "Question added");
      leave(onClose);
    } catch (err) {
      // The choices are typed into `optionsText`; the server names them `options` and `options[i]`.
      applyApiErrors(
        form,
        renameFieldErrors(err, (k) => (/^options(\[|$)/.test(k) ? "optionsText" : k)),
      );
    }
  });

  const deleteQuestion = async () => {
    if (!question) return;
    const ok = await confirmAction({
      title: "Delete this question?",
      message: `Answers already given stay on past ${v("bookings")}.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (await feedback.run(() => remove.mutateAsync(question.id), "Question deleted")) leave(onClose);
  };

  return (
    <Sheet
      visible
      onClose={() => void close()}
      title={question ? "Edit question" : "New question"}
      testID="question-sheet"
      footer={
        <Button
          testID="question-save"
          label={question ? "Save" : "Add question"}
          fullWidth
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      }
    >
      <Text tone="muted">Keep it short — people answer on their phones.</Text>
      <FormTextField
        control={form.control}
        name="label"
        label="Question"
        testID="question-label"
        placeholder="e.g. What would you like help with?"
        autoFocus={!question}
        returnKeyType="next"
        onSubmitEditing={() => form.setFocus("helpText")}
      />
      <FormTextField control={form.control} name="helpText" label="Hint (optional)" testID="question-hint" />
      <FormSelect
        control={form.control}
        name="kind"
        label="Answer type"
        testID="question-kind"
        options={QUESTION_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      />
      {kind === "select" ? (
        <FormTextField
          control={form.control}
          name="optionsText"
          label="Choices"
          testID="question-choices"
          hint="One per line."
          placeholder={"Piano\nGuitar\nVoice"}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      ) : null}
      <FormSelect
        control={form.control}
        name="serviceId"
        label="Ask for"
        testID="question-service"
        options={[
          { value: ALL_SERVICES, label: "All services" },
          ...services.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      <FormSwitch
        control={form.control}
        name="required"
        label="Required"
        testID="question-required"
        description="People can't book online without answering. Your team can skip it."
      />
      <FormSwitch
        control={form.control}
        name="sensitive"
        label="Sensitive"
        testID="question-sensitive"
        description="For health or personal details: never included in emails or shared with AI, and hidden until revealed in the dashboard."
      />
      {question ? (
        <FormSwitch control={form.control} name="isActive" label="Active" testID="question-active" />
      ) : null}
      <FormRootError control={form.control} />
      {question ? (
        <View style={styles.delete}>
          <Button
            testID="question-delete"
            variant="destructive"
            icon={Trash2}
            label="Delete question"
            loading={remove.isPending}
            onPress={() => void deleteQuestion()}
          />
          <Text variant="footnote" tone="subtle">
            Answers already given stay on past {v("bookings")}.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({ delete: { marginTop: space[4], gap: space[2] } });
