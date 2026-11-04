/**
 * Field limits the backend enforces, mirrored so a form can flag a value before the server rejects it. Each group
 * names the backend rule it copies; when that rule changes, change it here. Text limits apply to the trimmed text.
 */

/** An inclusive integer range. */
export type Range = { readonly min: number; readonly max: number };

/** `SetupValidation.validate` (`POST /businesses`) and the business `PATCH` (`BusinessSettings.apply`). */
export const BUSINESS_LIMITS = {
  name: 100,
  industry: 50,
  description: 2000,
  /** Each vocabulary word ("Bay", "Bays", …): `SetupValidation.validateVocabulary`. */
  vocabularyWord: 40,
} as const;

/** `SetupValidation.validatePolicies` (setup and the business `PATCH`). */
export const POLICY_LIMITS = {
  minNoticeMinutes: { min: 0, max: 60 * 24 * 90 },
  maxAdvanceDays: { min: 1, max: 730 },
  cancellationNoticeHours: { min: 0, max: 24 * 60 },
  lateCancellationRefundPercent: { min: 0, max: 100 },
  holdMinutes: { min: 5, max: 1440 },
} as const satisfies Record<string, Range>;

/** Customer groups: `validateGroup` (`CustomerGroupDtos.kt`) and `SetupValidation.validate`. */
export const GROUP_LIMITS = { key: 50, name: 100, description: 500 } as const;

/** Resources: `validateResource` (`ResourceValidation.kt`) and `SetupValidation.validate` (at most `perSetup` in one setup). */
export const RESOURCE_LIMITS = {
  key: 50,
  name: 100,
  description: 1000,
  capacity: { min: 1, max: 1000 },
  perSetup: 100,
} as const;

/** Services: `ServiceModels.validateService` (at most `perSetup` services in one setup). */
export const SERVICE_LIMITS = {
  name: 120,
  description: 2000,
  category: 60,
  durationMinutes: { min: 5, max: 1440 },
  bufferMinutes: { min: 0, max: 480 },
  slotIntervalMinutes: { min: 5, max: 1440 },
  minNoticeMinutes: { min: 0, max: 60 * 24 * 90 },
  maxAdvanceDays: { min: 1, max: 730 },
  capacity: { min: 1, max: 1000 },
  priceCents: { min: 0, max: 10_000_000 },
  options: 30,
  optionName: 120,
  optionDescription: 500,
  optionDurationMinutes: { min: 5, max: 1440 },
  addons: 30,
  addonName: 120,
  addonDescription: 500,
  addonExtraMinutes: { min: 0, max: 480 },
  requirements: 10,
  requirementLabel: 100,
  requirementQuantity: { min: 1, max: 20 },
  perSetup: 100,
} as const;

/** Booking-form questions: `validateQuestion` (`QuestionDtos.kt`) and `SetupValidation.validate`. */
export const QUESTION_LIMITS = {
  label: 200,
  helpText: 500,
  /** Choice questions: see `choicesProblem` in `./questions`. */
  options: 50,
  optionLength: 100,
} as const;

/** Customers: `CustomerDetails.from` (dashboard) and public bookings (`PublicBookingService.create`, name only). */
export const CUSTOMER_LIMITS = { name: 120, notes: 5000 } as const;

/** The backend's `Validator.PHONE`: 6 to 20 digits, spaces, brackets or hyphens, with an optional leading +. */
export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;
