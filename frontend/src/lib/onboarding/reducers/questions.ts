import type { QuestionAction, SetupHandlers } from "../actions";
import type { SetupDraft, SetupQuestion } from "../types";
import { mapAt, withSetup, without } from "./edit";

const NEW_QUESTION: SetupQuestion = {
  label: "",
  helpText: null,
  kind: "text",
  options: [],
  required: false,
  sensitive: false,
  serviceName: null,
};
/** Choices a question gets when it becomes a dropdown without any. */
const STARTER_OPTIONS = ["Option 1", "Option 2"];

function mapQuestion(draft: SetupDraft, index: number, fn: (q: SetupQuestion) => SetupQuestion): SetupDraft {
  return withSetup(draft, (s) => ({ ...s, questions: mapAt(s.questions, index, fn) }));
}

export const questionHandlers: SetupHandlers<QuestionAction> = {
  addQuestion: (draft) =>
    withSetup(draft, (s) => ({ ...s, questions: [...s.questions, { ...NEW_QUESTION, options: [] }] })),
  updateQuestion: (draft, action) =>
    mapQuestion(draft, action.index, (q) => {
      const next = { ...q, ...action.patch };
      if (next.kind === "select" && next.options.length === 0) next.options = [...STARTER_OPTIONS];
      return next;
    }),
  removeQuestion: (draft, action) =>
    withSetup(draft, (s) => ({ ...s, questions: without(s.questions, action.index) })),
  addQuestionOption: (draft, action) =>
    mapQuestion(draft, action.index, (q) => ({ ...q, options: [...q.options, ""] })),
  updateQuestionOption: (draft, action) =>
    mapQuestion(draft, action.index, (q) => ({
      ...q,
      options: mapAt(q.options, action.optionIndex, () => action.value),
    })),
  removeQuestionOption: (draft, action) =>
    mapQuestion(draft, action.index, (q) => ({ ...q, options: without(q.options, action.optionIndex) })),
};
