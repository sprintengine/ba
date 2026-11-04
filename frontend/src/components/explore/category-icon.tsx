import { createElement } from "react";
import type { LucideProps } from "lucide-react";
import { categoryIcon } from "@/lib/explore";

/** The registry icon for a marketplace category key (with the fallback for unknown keys). */
export function CategoryIcon({ category, ...props }: LucideProps & { category: string | null }) {
  return createElement(categoryIcon(category), { "aria-hidden": true, ...props });
}
