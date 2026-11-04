import type { LucideIcon } from "lucide-react";
import type { IndustrySlug } from "@/components/shells/industries";
import type { PaymentMode } from "@/lib/api/types";

export type ServiceOption = {
  name: string;
  description?: string;
  durationMinutes: number;
  priceCents: number;
};
export type ServiceAddon = { name: string; description?: string; extraMinutes: number; priceCents: number };

export type ExampleService = {
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  paymentMode: PaymentMode;
  /** For `deposit` services: charged when booking; the balance is paid at the venue. */
  depositCents?: number;
  options?: ServiceOption[];
  addons?: ServiceAddon[];
  /** Short qualifier shown as a badge, e.g. "New students only". */
  restriction?: string;
};

export type IndustryFeature = { icon: LucideIcon; title: string; body: string; comingSoon?: boolean };

export type PreviewQuestion = {
  label: string;
  kind: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  help?: string;
  sensitive?: boolean;
  optional?: boolean;
};

export type IndustryContent = {
  slug: IndustrySlug;
  /** Onboarding template key (`/onboarding?template=`). */
  templateKey: string;
  icon: LucideIcon;
  /** Brand colour of the example business (hex). */
  color: string;
  /** Singular label used in CTAs: "Start with the {label} template". */
  templateLabel: string;
  business: { name: string; slug: string; tagline: string; initials: string };
  vocabulary: { resource: string; resources: string; customer: string; customers: string; booking: string };
  meta: { title: string; description: string };
  hero: { eyebrow: string; title: string; description: string; points: string[] };
  services: ExampleService[];
  features: IndustryFeature[];
  preview: {
    /** Customer groups shown as a segmented choice (first is selected). */
    groups?: { label: string; hint: string }[];
    /** Index into `services` of the service selected by default. */
    serviceIndex: number;
    /** Services shown in the preview (indexes into `services`). */
    serviceIndexes: number[];
    resourceLabel: string;
    resourceChoices: string[];
    slots: string[];
    questions: PreviewQuestion[];
    /** Short line under the button, e.g. "Pay at the practice". */
    paymentNote: string;
  };
};
