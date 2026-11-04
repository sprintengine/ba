import { describe, expect, it } from "vitest";
import { CURRENCIES } from "./currencies";
import { QUESTION_KIND_LABEL, QUESTION_KINDS } from "./questions";
import { RESOURCE_KIND_LABEL, RESOURCE_KINDS } from "./resources";
import { PAYMENT_MODE_COPY, PAYMENT_MODES } from "./services";

describe("catalog", () => {
  it("labels every kind, in picker order", () => {
    expect(Object.keys(QUESTION_KIND_LABEL)).toEqual(QUESTION_KINDS);
    expect(Object.keys(RESOURCE_KIND_LABEL)).toEqual(RESOURCE_KINDS);
    expect(Object.keys(PAYMENT_MODE_COPY)).toEqual(PAYMENT_MODES);
  });

  it("lists each currency once, as an ISO 4217 code", () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
  });
});
