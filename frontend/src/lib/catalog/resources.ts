import type { ResourceKind } from "@/lib/api/types";

/** Every resource kind, in picker order (mirrors the backend's `RESOURCE_KINDS` in `Resources.kt`). Icons live with the components. */
export const RESOURCE_KINDS: readonly ResourceKind[] = ["person", "space", "equipment"];

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  person: "Person",
  space: "Space",
  equipment: "Equipment",
};
