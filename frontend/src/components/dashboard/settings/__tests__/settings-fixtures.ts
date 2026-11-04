/** Builders and API error responses shared by the settings component tests. */
import type { CustomerGroup, FormQuestion, Service } from "@/lib/api/types";
import { json } from "../../test/render";

/** The backend's error envelope as a `Response` (return it from a `mockApi` route). */
export const apiError = (
  status: number,
  code: string,
  message: string,
  fields: Record<string, string> = {},
) => json({ error: { code, message, fields } }, status);

/** 400 INVALID_REQUEST with per-field messages: what `applyApiErrors` maps onto the form. */
export const invalidRequest = (fields: Record<string, string>, message = "Check the highlighted fields.") =>
  apiError(400, "INVALID_REQUEST", message, fields);

export const group = (patch: Partial<CustomerGroup> = {}): CustomerGroup => ({
  id: "g1",
  name: "Members",
  description: null,
  restricted: false,
  sortOrder: 0,
  isActive: true,
  ...patch,
});

export const question = (patch: Partial<FormQuestion> = {}): FormQuestion => ({
  id: "q1",
  serviceId: null,
  label: "What would you like help with?",
  helpText: null,
  kind: "text",
  options: [],
  required: false,
  sensitive: false,
  sortOrder: 0,
  isActive: true,
  ...patch,
});

export const service = (id: string, name: string, patch: Partial<Service> = {}): Service => ({
  id,
  name,
  description: null,
  category: null,
  color: "#0e7c70",
  durationMinutes: 45,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIntervalMinutes: null,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  capacity: 1,
  priceCents: 4500,
  paymentMode: "at_venue",
  depositCents: null,
  allowPayAtVenue: false,
  requiresApproval: false,
  locationType: "business",
  allowedGroupIds: [],
  isPublic: true,
  isActive: true,
  sortOrder: 0,
  options: [],
  addons: [],
  requirements: [],
  ...patch,
});
