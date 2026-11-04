/** API types: Services. Import them from `@/lib/api/types`. */
import type { LocationType, PaymentMode, ResourceKind } from "./common";
import type { FormQuestion } from "./questions";

export type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  sortOrder: number;
};

export type ServiceAddon = {
  id: string;
  name: string;
  description: string | null;
  extraMinutes: number;
  priceCents: number;
  sortOrder: number;
};

export type ServiceRequirement = {
  id: string;
  label: string;
  quantity: number;
  /** The customer picks which resource fills this requirement. */
  customerSelectable: boolean;
  resourceIds: string[];
  sortOrder: number;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  color: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  /** null = use the duration. */
  slotIntervalMinutes: number | null;
  /** null = business policy. */
  minNoticeMinutes: number | null;
  /** null = business policy. */
  maxAdvanceDays: number | null;
  capacity: number;
  priceCents: number;
  paymentMode: PaymentMode;
  depositCents: number | null;
  /** A `full` or `deposit` service the customer may choose to pay at the venue instead (false for other modes). */
  allowPayAtVenue: boolean;
  requiresApproval: boolean;
  locationType: LocationType;
  /** Empty = everyone. */
  allowedGroupIds: string[];
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  options: ServiceOption[];
  addons: ServiceAddon[];
  requirements: ServiceRequirement[];
};

/**
 * Options/add-ons/requirements may carry their existing `id` (backend
 * extension): matching items are updated in place and keep their ids, so
 * bookings that reference an option stay linked. Omit `id` for new items.
 */
export type ServiceInput = Omit<Service, "id" | "options" | "addons" | "requirements"> & {
  options: (Omit<ServiceOption, "id"> & { id?: string })[];
  addons: (Omit<ServiceAddon, "id"> & { id?: string })[];
  requirements: (Omit<ServiceRequirement, "id"> & { id?: string })[];
};

export type PublicService = Omit<Service, "requirements" | "allowedGroupIds" | "isPublic" | "isActive"> & {
  allowedGroupIds: string[];
  selectableRequirement: {
    id: string;
    label: string;
    resources: { id: string; name: string; description: string | null; kind: ResourceKind }[];
  } | null;
  questions: Omit<FormQuestion, "serviceId" | "isActive">[];
};
