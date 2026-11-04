import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { flattenFieldErrors, renameFieldErrors } from "./api-fields";

describe("flattenFieldErrors", () => {
  it("removes the given prefixes from field keys and keeps the rest of the error", () => {
    const error = new ApiError(400, "INVALID_REQUEST", "Check the highlighted fields.", {
      "address.city": "Too long",
      "policies.holdMinutes": "Must be between 5 and 1440",
      name: "Required",
      "addressee.x": "Not a prefix match",
    });
    const flat = flattenFieldErrors(error, ["address", "policies"]);
    expect(flat).toBeInstanceOf(ApiError);
    expect(flat).toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Check the highlighted fields.",
      fields: {
        city: "Too long",
        holdMinutes: "Must be between 5 and 1440",
        name: "Required",
        "addressee.x": "Not a prefix match",
      },
    });
  });

  it("returns anything that isn't an API error unchanged", () => {
    const error = new Error("boom");
    expect(flattenFieldErrors(error, ["address"])).toBe(error);
    expect(renameFieldErrors(error, () => "x")).toBe(error);
  });
});

describe("renameFieldErrors", () => {
  it("renames each key", () => {
    const error = new ApiError(400, "INVALID_REQUEST", "Check the highlighted fields.", {
      "options[1]": "Must be 1 to 100 characters",
      label: "Required",
    });
    const renamed = renameFieldErrors(error, (key) => (key.startsWith("options") ? "optionsText" : key));
    expect(renamed).toMatchObject({
      fields: { optionsText: "Must be 1 to 100 characters", label: "Required" },
    });
  });
});
