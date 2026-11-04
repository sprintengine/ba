import {
  Activity,
  CarFront,
  Dumbbell,
  Flower2,
  GraduationCap,
  Music,
  PawPrint,
  Scissors,
  Smile,
  Sparkles,
  Stethoscope,
  Store,
  type LucideIcon,
} from "lucide-react";

/**
 * Marketplace category key → icon. Keys come from the backend (`MarketplaceCategories`); a category added
 * there gets `FALLBACK_CATEGORY_ICON` until an entry is added here, so no frontend change is required.
 */
export const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  physio: Activity,
  "gp-practice": Stethoscope,
  dental: Smile,
  salon: Sparkles,
  barber: Scissors,
  massage: Flower2,
  fitness: Dumbbell,
  "music-lessons": Music,
  tutoring: GraduationCap,
  "car-wash": CarFront,
  "pet-grooming": PawPrint,
  other: Store,
};

export const FALLBACK_CATEGORY_ICON: LucideIcon = Store;

export function categoryIcon(key: string | null | undefined): LucideIcon {
  return (
    (key && Object.hasOwn(CATEGORY_ICONS, key) ? CATEGORY_ICONS[key] : undefined) ?? FALLBACK_CATEGORY_ICON
  );
}
