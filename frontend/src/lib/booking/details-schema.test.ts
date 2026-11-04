import { describe, expect, it } from "vitest";
import {
  answersPayload,
  answerIssues,
  buildDetailsSchema,
  EMPTY_DETAILS,
  isAnswered,
  storableDetails,
  type Question,
} from "./details-schema";

const q = (over: Partial<Question>): Question => ({
  id: "q",
  label: "Q",
  helpText: null,
  kind: "text",
  options: [],
  required: false,
  sensitive: false,
  sortOrder: 1,
  ...over,
});

describe("details schema", () => {
  const questions = [
    q({ id: "reg", kind: "text", required: true }),
    q({ id: "size", kind: "select", options: ["Small", "SUV"] }),
    q({ id: "ok", kind: "checkbox", required: true }),
    q({ id: "age", kind: "number" }),
  ];
  const valid = {
    ...EMPTY_DETAILS,
    name: "Alex Morgan",
    email: "alex@example.com",
    answers: { reg: "241-D-1234", ok: "true" },
  };

  it("accepts valid details; optional questions may be missing", () => {
    expect(buildDetailsSchema({ requirePhone: false, questions }).safeParse(valid).success).toBe(true);
  });

  it("enforces phone policy, required questions, select options and checkbox confirmation", () => {
    const schema = buildDetailsSchema({ requirePhone: true, questions });
    const r = schema.safeParse({ ...valid, answers: { reg: "", size: "Van", ok: "false", age: "ten" } });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining(["phone", "answers.reg", "answers.size", "answers.ok", "answers.age"]),
    );
  });

  it("validates email and phone formats", () => {
    const schema = buildDetailsSchema({ requirePhone: false, questions: [] });
    expect(schema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, phone: "+353 87 123 4567" }).success).toBe(true);
  });

  it("sends only this service's non-blank answers", () => {
    const values = { ...valid, answers: { reg: " 241-D-1 ", size: "", other: "x", ok: "true" } };
    expect(answersPayload(values, questions)).toEqual({ reg: "241-D-1", ok: "true" });
  });

  it("never stores sensitive answers", () => {
    const qs = [q({ id: "why", sensitive: true }), q({ id: "how" })];
    const stored = storableDetails({ ...valid, answers: { why: "back pain", how: "friend" } }, qs);
    expect(stored.answers).toEqual({ how: "friend" });
  });
});

describe("answers", () => {
  it("counts a ticked box or any text as answered", () => {
    expect(isAnswered({ kind: "checkbox" }, "false")).toBe(false);
    expect(isAnswered({ kind: "checkbox" }, "true")).toBe(true);
    expect(isAnswered({ kind: "text" }, "  ")).toBe(false);
    expect(isAnswered({ kind: "text" }, undefined)).toBe(false);
    expect(isAnswered({ kind: "text" }, "false")).toBe(true);
  });

  it("checks each kind's format and the length limits", () => {
    expect(answerIssues(q({ kind: "text" }), "x".repeat(501))).toEqual(["Keep it under 500 characters"]);
    expect(answerIssues(q({ kind: "text" }), "x".repeat(2001))).toEqual([
      "Keep it under 2000 characters",
      "Keep it under 500 characters",
    ]);
    expect(answerIssues(q({ kind: "textarea" }), "x".repeat(1500))).toEqual([]);
    expect(answerIssues(q({ kind: "number" }), "-1.5")).toEqual([]);
    expect(answerIssues(q({ kind: "number" }), "1e3")).toEqual(["Enter a number"]);
    expect(answerIssues(q({ kind: "email" }), "a@b")).toEqual(["Enter a valid email address"]);
    expect(answerIssues(q({ kind: "phone" }), "+353 1 555 0101")).toEqual([]);
    expect(answerIssues(q({ kind: "select", options: ["A"] }), "B")).toEqual(["Choose one of the options"]);
  });

  it("asks for a missing required answer in the question's terms", () => {
    const schema = (kind: Question["kind"]) =>
      buildDetailsSchema({ requirePhone: false, questions: [q({ id: "x", kind, required: true })] });
    const message = (kind: Question["kind"]) => {
      const answers = { x: kind === "checkbox" ? "false" : "" };
      const r = schema(kind).safeParse({ ...EMPTY_DETAILS, name: "A", email: "a@b.co", answers });
      return r.success ? null : r.error.issues[0]?.message;
    };
    expect(message("checkbox")).toBe("Please confirm to continue");
    expect(message("select")).toBe("Choose an option");
    expect(message("text")).toBe("Please answer this question");
  });
});
