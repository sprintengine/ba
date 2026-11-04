/**
 * Resource dialog model: zod schema for the form, and conversions between the API `Resource` /
 * `ResourceInput` and form values. Kept free of React so it can be unit-tested.
 */
import * as z from "zod";
import type { Resource, ResourceInput, ResourceKind } from "@/lib/api/types";
import { SERVICE_COLORS } from "@/lib/services/service-form";
import { HEX_COLOR } from "@/lib/theme/color";
import { RESOURCE_LIMITS as L } from "@/lib/validation/limits";

/**
 * The type choice in the dialog. "Room / space" differs from the shared `RESOURCE_KIND_LABEL` ("Space",
 * lib/catalog/resources.ts): which wording to keep is a product decision.
 */
export const RESOURCE_KIND_TITLE: Record<ResourceKind, string> = {
  person: "Person",
  space: "Room / space",
  equipment: "Equipment",
};

export const RESOURCE_NAME_PLACEHOLDER: Record<ResourceKind, string> = {
  person: "e.g. Alex Morgan",
  space: "e.g. Room 1",
  equipment: "e.g. Ultrasound unit",
};

/** The "Team member" select's value for an unlinked resource. */
export const NO_MEMBER = "none";

export const resourceFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(L.name, `Keep it under ${L.name} characters`),
  kind: z.enum(["person", "space", "equipment"]),
  description: z.string().max(L.description, `Keep it under ${L.description} characters`),
  color: z.string().regex(HEX_COLOR),
  capacity: z
    .number({ error: "Enter a capacity" })
    .int("Whole numbers only")
    .min(L.capacity.min, `At least ${L.capacity.min}`)
    .max(L.capacity.max, `At most ${L.capacity.max}`),
  memberId: z.string(),
  isActive: z.boolean(),
});

export type ResourceFormValues = z.infer<typeof resourceFormSchema>;

/** Form values for `resource`, or a new resource's defaults (the colour cycles with its position). */
export function resourceToFormValues(resource: Resource | null, nextSortOrder: number): ResourceFormValues {
  if (!resource) {
    return {
      name: "",
      kind: "person",
      description: "",
      color: SERVICE_COLORS[nextSortOrder % SERVICE_COLORS.length] ?? SERVICE_COLORS[0],
      capacity: 1,
      memberId: NO_MEMBER,
      isActive: true,
    };
  }
  return {
    name: resource.name,
    kind: resource.kind,
    description: resource.description ?? "",
    color: resource.color,
    capacity: resource.capacity,
    memberId: resource.memberId ?? NO_MEMBER,
    isActive: resource.isActive,
  };
}

export function formValuesToResourceInput(values: ResourceFormValues, sortOrder: number): ResourceInput {
  return {
    name: values.name.trim(),
    kind: values.kind,
    description: values.description.trim() || null,
    color: values.color,
    capacity: values.capacity,
    // Only a person is linked to a team member: a link chosen before switching the type to a room is dropped.
    memberId: values.kind !== "person" || values.memberId === NO_MEMBER ? null : values.memberId,
    isActive: values.isActive,
    sortOrder,
  };
}

/** The colour choices: the palette, plus the resource's own colour first when it isn't one of them. */
export function resourceSwatches(resource: Pick<Resource, "color"> | null): string[] {
  const palette: readonly string[] = SERVICE_COLORS;
  return resource && !palette.includes(resource.color) ? [resource.color, ...palette] : [...palette];
}
