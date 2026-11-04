import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { isApiError } from "@shared/api/client";

/**
 * The website's `applyApiErrors` (components/ui/form.tsx) for the app's forms: `ApiError.fields` become field errors
 * (the first one is focused), anything the form has no field for, and the message, go to `root` (`<FormRootError>`).
 * List items named with an index (`options[0].name`) map to the form's `options.0.name`. Rename keys that differ
 * from the form's names first (`flattenFieldErrors` / `renameFieldErrors` from `@shared/settings/api-fields`).
 * Returns true when it handled an ApiError.
 */
export function applyApiErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown): boolean {
  if (!isApiError(error)) {
    form.setError("root", { message: "Something went wrong. Please try again." });
    return false;
  }
  const known = new Set(Object.keys(form.getValues()));
  let setAny = false;
  for (const [apiField, message] of Object.entries(error.fields)) {
    const field = apiField.replace(/\[(\d+)\]/g, ".$1");
    const [top = field] = field.split(".");
    if (known.has(top)) {
      form.setError(field as FieldPath<T>, { message }, { shouldFocus: !setAny });
      setAny = true;
    }
  }
  if (!setAny || Object.keys(error.fields).length === 0) {
    form.setError("root", { message: error.message });
  }
  return true;
}
