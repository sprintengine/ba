/** Form helpers for the staff forms (react-hook-form with the website's zod schemas, as the website does). */
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { isApiError } from "@shared/api/client";

/**
 * Put an API error's field errors on the form's fields (the website's `applyApiErrors`): `customer.email` errors land
 * on that field; anything the form has no field for, or an error without fields, becomes the form's root error.
 */
export function applyApiErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown): void {
  if (!isApiError(error)) {
    form.setError("root", { message: "Something went wrong. Please try again." });
    return;
  }
  const known = new Set(Object.keys(form.getValues()));
  let setAny = false;
  for (const [apiField, message] of Object.entries(error.fields)) {
    const field = apiField.replace(/\[(\d+)\]/g, ".$1");
    const [top = field] = field.split(".");
    if (known.has(top)) {
      form.setError(field as FieldPath<T>, { message });
      setAny = true;
    }
  }
  if (!setAny) form.setError("root", { message: error.message });
}
