import { act, renderHook } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { ApiError } from "@shared/api/client";
import { applyApiErrors } from "./form";

type Values = { customer: { name: string; email: string }; addonIds: string[]; notes: string };

function setup() {
  const { result } = renderHook(() => {
    const form = useForm<Values>({
      defaultValues: { customer: { name: "", email: "" }, addonIds: [], notes: "" },
    });
    void form.formState.errors; // subscribe, as a form showing its errors does
    return form;
  });
  const apply = (err: unknown) => act(() => applyApiErrors(result.current, err));
  const errors = () => result.current.formState.errors;
  return { apply, errors, result };
}

describe("applyApiErrors", () => {
  it("puts the API's field errors on the form's fields, nested and indexed", () => {
    const { apply, result } = setup();
    apply(
      new ApiError(422, "INVALID_REQUEST", "Check the details", {
        "customer.email": "Already used by another patient",
        "addonIds[0]": "No longer offered",
        unknownThing: "Ignored",
      }),
    );
    expect(result.current.getFieldState("customer.email").error?.message).toBe(
      "Already used by another patient",
    );
    expect(result.current.getFieldState("addonIds.0").error?.message).toBe("No longer offered");
    expect(result.current.formState.errors.root).toBeUndefined();
  });

  it("shows the API's message on the form when no field matches", () => {
    const { apply, errors } = setup();
    apply(new ApiError(422, "INVALID_REQUEST", "Something about the room", { room: "Closed" }));
    expect(errors().root?.message).toBe("Something about the room");
  });

  it("shows the API's message for an error without fields", () => {
    const { apply, errors } = setup();
    apply(new ApiError(500, "INTERNAL", "Boom"));
    expect(errors().root?.message).toBe("Boom");
  });

  it("says something went wrong for anything that isn't an API error", () => {
    const { apply, errors } = setup();
    apply(new Error("socket hang up"));
    expect(errors().root?.message).toBe("Something went wrong. Please try again.");
  });
});
