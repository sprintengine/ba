import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { useTemplate } from "@/lib/api/hooks";
import type { BusinessSetup } from "@/lib/api/types";
import { WIZARD_PROGRESS, wizardView } from "./wizard-state";

type Template = ReturnType<typeof useTemplate>;
const loading = { data: undefined, isError: false, error: null } as unknown as Template;
const failed = (error: ApiError) => ({ data: undefined, isError: true, error }) as unknown as Template;
const business = { id: "b1", slug: "gleam", name: "Gleam", primaryColor: "#0369a1", hasPaidServices: false };

describe("wizardView", () => {
  it("stays on Start while a template loads, then reviews it", () => {
    expect(wizardView({ step: "template", key: "car_wash" }, loading)).toEqual({
      step: "start",
      pendingTemplate: "car_wash",
      templateError: null,
    });
    const setup = { name: "Gleam", slug: null } as unknown as BusinessSetup;
    const view = wizardView({ step: "template", key: "car_wash" }, { ...loading, data: setup } as Template);
    expect(view).toMatchObject({
      step: "review",
      reviewKey: "template-car_wash",
      origin: { kind: "template", key: "car_wash" },
    });
  });

  it("explains a template that can't be loaded", () => {
    expect(
      wizardView({ step: "template", key: "nope" }, failed(new ApiError(404, "NOT_FOUND", "Not found"))),
    ).toEqual({
      step: "start",
      pendingTemplate: null,
      templateError: `We couldn't find the "nope" template. Pick one below or describe your business.`,
    });
    expect(
      wizardView({ step: "template", key: "x" }, failed(new ApiError(500, "INTERNAL", "Server error"))).step,
    ).toBe("start");
  });

  it("passes the other steps through with their progress", () => {
    expect(wizardView({ step: "start" }, loading)).toEqual({
      step: "start",
      pendingTemplate: null,
      templateError: null,
    });
    expect(wizardView({ step: "site", business }, loading)).toEqual({ step: "site", business });
    expect(WIZARD_PROGRESS[wizardView({ step: "success", business }, loading).step]).toBe(3);
    expect(WIZARD_PROGRESS[wizardView({ step: "describe" }, loading).step]).toBe(0);
  });
});
