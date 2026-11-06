"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FormQuestion } from "@/lib/api/types";
import { useCreateQuestion, useServices, useUpdateQuestion } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { QUESTION_KINDS } from "@/lib/catalog/questions";
import { renameFieldErrors } from "@/lib/settings/api-fields";
import {
  ALL_SERVICES,
  formValuesToQuestionInput,
  KIND_LABEL,
  questionSchema,
  questionToFormValues,
  type QuestionFormValues as V,
} from "@/lib/settings/question-form";
import { applyApiErrors, FormField, FormRootError } from "@/components/ui/form";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/** Create or edit a booking question. */
export function QuestionDialog({
  question,
  nextSort,
  defaultService,
  starter,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  question: FormQuestion | null;
  nextSort: number;
  defaultService: string;
  /** A suggested wording for a new question, to accept or change. */
  starter?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const business = useCurrentBusiness();
  const services = useServices(business.id);
  const create = useCreateQuestion(business.id);
  const update = useUpdateQuestion(business.id);
  const form = useForm<V>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      ...questionToFormValues(question, defaultService),
      ...(starter ? { label: starter } : {}),
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      form={form}
      title={question ? "Edit question" : "New question"}
      description="Keep it short — people answer on their phones."
      submitLabel={question ? "Save" : "Add question"}
      onSubmit={async (v) => {
        const input = formValuesToQuestionInput(v, question?.sortOrder ?? nextSort);
        try {
          if (question) await update.mutateAsync({ id: question.id, input });
          else await create.mutateAsync(input);
          toast.success(question ? "Question saved" : "Question added");
          onOpenChange(false);
        } catch (err) {
          // The choices are typed into `optionsText`; the server names them `options` and `options[i]`.
          applyApiErrors(
            form,
            renameFieldErrors(err, (k) => (/^options(\[|$)/.test(k) ? "optionsText" : k)),
          );
        }
      }}
    >
      <FormField<V, "label"> name="label" label="Question" required>
        {(field) => <Input {...field} placeholder="e.g. What would you like help with?" autoFocus />}
      </FormField>
      <FormField<V, "helpText"> name="helpText" label="Hint" optional>
        {(field) => <Input {...field} />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField<V, "kind"> name="kind" label="Answer type">
          {(field) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger ref={field.ref}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField<V, "serviceId"> name="serviceId" label="Ask for">
          {(field) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger ref={field.ref}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SERVICES}>All services</SelectItem>
                <SelectSeparator />
                {(services.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>
      {kind === "select" && (
        <FormField<V, "optionsText"> name="optionsText" label="Choices" help="One per line.">
          {(field) => <Textarea {...field} rows={4} placeholder={"Piano\nGuitar\nVoice"} />}
        </FormField>
      )}
      <FormField<V, "required">
        name="required"
        orientation="horizontal"
        label="Required"
        help="People can't book online without answering. Your team can skip it."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      <FormField<V, "sensitive">
        name="sensitive"
        orientation="horizontal"
        label="Sensitive"
        help="For health or personal details: never included in emails or shared with AI, and hidden until revealed in the dashboard."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      {question && (
        <FormField<V, "isActive"> name="isActive" orientation="horizontal" label="Active">
          {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        </FormField>
      )}
      <FormRootError />
    </FormDialog>
  );
}
