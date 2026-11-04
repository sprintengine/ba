/** The API's error envelope, as `apiFetch` parses it into an `ApiError`. */
import type { ApiErrorBody } from "@/lib/api/client";

export const invalidRequest = {
  error: {
    code: "INVALID_REQUEST",
    message: "Check the highlighted fields.",
    fields: { name: "Enter a name", "customer.email": "Must be a valid email address" },
  },
} satisfies ApiErrorBody;

export const slotUnavailable = {
  error: { code: "SLOT_UNAVAILABLE", message: "That time was just taken.", fields: {} },
} satisfies ApiErrorBody;
