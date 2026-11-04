import type { SiteSectionOf, SiteSectionType } from "@/lib/api/types";

/** Props every section block receives. */
export type SectionProps<T extends SiteSectionType> = {
  section: SiteSectionOf<T>;
  /** The DOM id for in-page links (`#services`). */
  anchor: string;
};
