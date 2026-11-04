/** The icon of a template (the website's template-icon.tsx with lucide-react-native). */
import {
  Activity,
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Brush,
  Building2,
  Calendar,
  Camera,
  Car,
  Coffee,
  Dog,
  Dumbbell,
  Flower2,
  GraduationCap,
  Hammer,
  HeartPulse,
  House,
  Laptop,
  Leaf,
  Music,
  Palette,
  PawPrint,
  Scissors,
  Shirt,
  Smile,
  Sparkles,
  Stethoscope,
  Store,
  Syringe,
  Users,
  Utensils,
  Waves,
  Wrench,
} from "lucide-react-native";
import type { IconComponent } from "~/ui";

/** Lucide names the backend may send in `TemplateSummary.icon` (kebab or Pascal case). */
const ICONS: Record<string, IconComponent> = {
  activity: Activity,
  baby: Baby,
  bike: Bike,
  "book-open": BookOpen,
  briefcase: Briefcase,
  brush: Brush,
  "building-2": Building2,
  building: Building2,
  calendar: Calendar,
  camera: Camera,
  car: Car,
  coffee: Coffee,
  dog: Dog,
  dumbbell: Dumbbell,
  "flower-2": Flower2,
  flower: Flower2,
  "graduation-cap": GraduationCap,
  hammer: Hammer,
  "heart-pulse": HeartPulse,
  house: House,
  home: House,
  laptop: Laptop,
  leaf: Leaf,
  music: Music,
  palette: Palette,
  "paw-print": PawPrint,
  scissors: Scissors,
  shirt: Shirt,
  smile: Smile,
  sparkles: Sparkles,
  stethoscope: Stethoscope,
  store: Store,
  syringe: Syringe,
  users: Users,
  utensils: Utensils,
  waves: Waves,
  wrench: Wrench,
};

export function templateIcon(name: string | null | undefined): IconComponent {
  if (!name) return Calendar;
  const key = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
  return ICONS[key] ?? Calendar;
}
