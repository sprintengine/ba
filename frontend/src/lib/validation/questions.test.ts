import { describe, expect, it } from "vitest";
import { choicesProblem } from "./questions";

describe("choicesProblem", () => {
  it.each([
    [["Only one"], null],
    [Array.from({ length: 50 }, (_, i) => `Choice ${i}`), null],
    [["x".repeat(100)], null],
    [[], "Add at least one choice"],
    [Array.from({ length: 51 }, (_, i) => `Choice ${i}`), "At most 50 choices"],
    [["Fine", " "], "Choices can't be blank"],
    [["x".repeat(101)], "Keep each choice to 100 characters or fewer"],
  ])("%j → %s", (choices, problem) => {
    expect(choicesProblem(choices)).toBe(problem);
  });
});
