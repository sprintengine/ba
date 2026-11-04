/** Settings → Customer groups: the group dialog's zod schema and CustomerGroup ↔ form values ↔ input. */
import * as z from "zod";
import type { CustomerGroup, CustomerGroupInput } from "@/lib/api/types";
import { GROUP_LIMITS } from "@/lib/validation/limits";

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, "Name the group").max(GROUP_LIMITS.name),
  description: z.string().max(GROUP_LIMITS.description),
  restricted: z.boolean(),
  isActive: z.boolean(),
});

export type GroupFormValues = z.infer<typeof groupFormSchema>;

export const groupToFormValues = (group: CustomerGroup | null): GroupFormValues => ({
  name: group?.name ?? "",
  description: group?.description ?? "",
  restricted: group?.restricted ?? false,
  isActive: group?.isActive ?? true,
});

export const formValuesToGroupInput = (v: GroupFormValues, sortOrder: number): CustomerGroupInput => ({
  name: v.name.trim(),
  description: v.description.trim() || null,
  restricted: v.restricted,
  isActive: v.isActive,
  sortOrder,
});
