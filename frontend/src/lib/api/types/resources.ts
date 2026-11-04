/** API types: Resources and availability. Import them from `@/lib/api/types`. */
import type { DayOfWeek, ResourceKind } from "./common";

export type Resource = {
  id: string;
  kind: ResourceKind;
  name: string;
  description: string | null;
  color: string;
  capacity: number;
  /** Team member linked to this resource (staff see only their own resources). */
  memberId: string | null;
  isActive: boolean;
  sortOrder: number;
};
export type ResourceInput = Omit<Resource, "id">;

export type AvailabilityRule = {
  id: string;
  resourceId: string;
  dayOfWeek: DayOfWeek;
  /** `HH:mm` */
  startTime: string;
  /** `HH:mm` */
  endTime: string;
  /** `YYYY-MM-DD` */
  validFrom: string | null;
  /** `YYYY-MM-DD` */
  validUntil: string | null;
  /** Empty = everyone; otherwise only these customer groups may book these hours. */
  audienceGroupIds: string[];
};
export type AvailabilityRuleInput = Omit<AvailabilityRule, "id" | "resourceId">;

export type AvailabilityOverride = {
  id: string;
  /** null = business-wide closure. */
  resourceId: string | null;
  /** `YYYY-MM-DD` */
  date: string;
  isAvailable: boolean;
  /** `HH:mm`; null with `isAvailable: false` = whole day. */
  startTime: string | null;
  /** `HH:mm` */
  endTime: string | null;
  reason: string | null;
};
export type AvailabilityOverrideInput = Omit<AvailabilityOverride, "id" | "resourceId">;

/** `GET /resources/{id}/availability` */
export type ResourceAvailability = { rules: AvailabilityRule[]; overrides: AvailabilityOverride[] };

/** `PUT /resources/{id}/rules` response: the complete new weekly set. */
export type ReplaceRulesResult = { rules: AvailabilityRule[] };
