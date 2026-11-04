/** API types: Templates, onboarding, AI. Import them from `@/lib/api/types`. */
import type { Branding, Policies, Vocabulary } from "./business";
import type { ResourceKind } from "./common";
import type { FormQuestionInput } from "./questions";
import type { ServiceInput } from "./services";

export type TemplateSummary = { key: string; name: string; description: string; icon: string };

export type BusinessSetup = {
  source?: "template" | "ai";
  name: string;
  slug: string | null;
  industry: string;
  description: string | null;
  timezone: string;
  currency: string;
  locale: string;
  country: string;
  vocabulary: Vocabulary;
  branding: Branding;
  policies: Policies;
  customerGroups: { key: string; name: string; description: string | null; restricted: boolean }[];
  resources: {
    key: string;
    kind: ResourceKind;
    name: string;
    description: string | null;
    capacity: number;
    weeklyHours: { dayOfWeek: number; startTime: string; endTime: string; audienceGroupKeys: string[] }[];
  }[];
  services: (Omit<
    ServiceInput,
    "requirements" | "allowedGroupIds" | "isActive" | "sortOrder" | "allowPayAtVenue"
  > & {
    requirements: { label: string; quantity: number; customerSelectable: boolean; resourceKeys: string[] }[];
    allowedGroupKeys: string[];
  })[];
  questions: (Omit<FormQuestionInput, "serviceId" | "isActive" | "sortOrder"> & {
    serviceName: string | null;
  })[];
};

/** `POST /ai/business-draft` */
export type AiDraftInput = { description: string; websiteUrl?: string | null };

/** `GET /businesses/slug-available` */
export type SlugAvailability = { available: boolean; suggestion: string | null };
