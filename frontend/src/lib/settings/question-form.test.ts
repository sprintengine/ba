import { describe, expect, it } from "vitest";
import type { FormQuestion } from "@/lib/api/types";
import {
  ALL_SERVICES,
  formValuesToQuestionInput,
  parseChoices,
  questionSchema,
  questionToFormValues,
  type QuestionFormValues,
} from "./question-form";

const question: FormQuestion = {
  id: "q1",
  serviceId: null,
  label: "Which instrument?",
  helpText: null,
  kind: "select",
  options: ["Piano", "Guitar"],
  required: true,
  sensitive: false,
  sortOrder: 4,
  isActive: true,
};

const issues = (v: QuestionFormValues) => {
  const r = questionSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("question form", () => {
  it("defaults a new question to a short answer for the given service", () => {
    expect(questionToFormValues(null, "s1")).toEqual({
      label: "",
      helpText: "",
      kind: "text",
      optionsText: "",
      required: false,
      sensitive: false,
      serviceId: "s1",
      isActive: true,
    });
  });

  it("maps a question: choices one per line, every service as all", () => {
    expect(questionToFormValues(question, "s1")).toMatchObject({
      helpText: "",
      optionsText: "Piano\nGuitar",
      serviceId: ALL_SERVICES,
    });
  });

  it("builds the input: trimmed, blank hint as null, choices only for select", () => {
    const values = {
      ...questionToFormValues(question, "s1"),
      label: " Which? ",
      optionsText: " Piano \n\nVoice\n",
    };
    expect(formValuesToQuestionInput(values, 4)).toEqual({
      label: "Which?",
      helpText: null,
      kind: "select",
      options: ["Piano", "Voice"],
      required: true,
      sensitive: false,
      serviceId: null,
      isActive: true,
      sortOrder: 4,
    });
    expect(formValuesToQuestionInput({ ...values, kind: "text", serviceId: "s2" }, 0)).toMatchObject({
      options: [],
      serviceId: "s2",
    });
  });

  it("parses choices ignoring blank lines", () => {
    expect(parseChoices("a\n \n b\n")).toEqual(["a", "b"]);
  });

  it("needs a label and choices for a choice question", () => {
    expect(issues(questionToFormValues(question, "s1"))).toEqual([]);
    expect(issues({ ...questionToFormValues(null, "s1"), label: " " })).toEqual([
      "label: Write the question",
    ]);
  });

  it("allows a hint of up to 500 characters, like the backend", () => {
    const base = questionToFormValues(question, "s1");
    expect(issues({ ...base, helpText: "x".repeat(500) })).toEqual([]);
    expect(issues({ ...base, helpText: "x".repeat(501) })[0]).toMatch(/^helpText:/);
  });

  it("checks choices like the backend: at least one, at most 50, each up to 100 characters", () => {
    const choice = (optionsText: string) => issues({ ...questionToFormValues(question, "s1"), optionsText });
    expect(choice("Only one")).toEqual([]);
    expect(choice(" \n ")).toEqual(["optionsText: Add at least one choice"]);
    const many = Array.from({ length: 50 }, (_, i) => `Choice ${i}`);
    expect(choice(many.join("\n"))).toEqual([]);
    expect(choice([...many, "One more"].join("\n"))).toEqual(["optionsText: At most 50 choices"]);
    expect(choice("x".repeat(100))).toEqual([]);
    expect(choice("x".repeat(101))).toEqual(["optionsText: Keep each choice to 100 characters or fewer"]);
    // Other kinds ignore the choices box.
    expect(issues({ ...questionToFormValues(question, "s1"), kind: "text", optionsText: "" })).toEqual([]);
  });
});
