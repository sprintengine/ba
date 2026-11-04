/** API types: Shared aliases. Import them from `@/lib/api/types`. */

export type MemberRole = "owner" | "admin" | "staff";
export type Plan = "free" | "pro" | "business";
export type PaidPlan = Exclude<Plan, "free">;
export type BusinessStatus = "draft" | "active" | "suspended";
export type LocationType = "business" | "customer" | "online";
export type ResourceKind = "person" | "space" | "equipment";
export type PaymentMode = "full" | "deposit" | "at_venue" | "free";
export type BookingStatus =
  "held" | "pending_approval" | "confirmed" | "completed" | "cancelled" | "no_show" | "expired";
export type PaymentStatus =
  "not_required" | "pending" | "paid" | "partially_refunded" | "refunded" | "failed" | "pay_at_venue";
export type BookingSource = "public" | "dashboard" | "api" | "ai";
export type FormQuestionKind = "text" | "textarea" | "select" | "checkbox" | "number" | "phone" | "email";
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Cursor-paginated list (`?limit=&cursor=`). `nextCursor` is null on the last page. */
export type Page<T> = { items: T[]; nextCursor: string | null };
