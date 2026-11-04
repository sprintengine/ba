"use client";

/**
 * Section editor registry (the editing part of the section registry; see lib/site/sections.ts for
 * schema/defaults and components/site/section-renderers.tsx for renderers). Typed over every
 * section type: a new type fails to compile until it has a form and an icon.
 */
import type { ComponentType } from "react";
import {
  CalendarCheck2,
  Clock3,
  HelpCircle,
  Images,
  LayoutTemplate,
  Megaphone,
  MessageSquareQuote,
  Phone,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { SiteSectionOf, SiteSectionType } from "@/lib/api/types";
import { AboutForm } from "./forms/about-form";
import { ContactForm } from "./forms/contact-form";
import { CtaForm } from "./forms/cta-form";
import { FaqForm } from "./forms/faq-form";
import { GalleryForm } from "./forms/gallery-form";
import { HeroForm } from "./forms/hero-form";
import { HoursForm } from "./forms/hours-form";
import { ServicesForm } from "./forms/services-form";
import { TeamForm } from "./forms/team-form";
import { TestimonialsForm } from "./forms/testimonials-form";

type SectionEditor<T extends SiteSectionType> = {
  icon: LucideIcon;
  Form: ComponentType<{ section: SiteSectionOf<T> }>;
  /** One-line summary of the content for the section list. */
  summary: (section: SiteSectionOf<T>) => string | null;
};

const count = (n: number, word: string) =>
  n === 0 ? `No ${word}s yet` : `${n} ${word}${n === 1 ? "" : "s"}`;

const SECTION_EDITORS: { [T in SiteSectionType]: SectionEditor<T> } = {
  hero: { icon: LayoutTemplate, Form: HeroForm, summary: (s) => s.content.headline },
  services: {
    icon: Sparkles,
    Form: ServicesForm,
    summary: (s) =>
      s.content.serviceIds.length ? count(s.content.serviceIds.length, "service") : "All services",
  },
  team: {
    icon: UserRound,
    Form: TeamForm,
    summary: (s) => (s.content.members.length ? count(s.content.members.length, "person") : "Everyone"),
  },
  about: { icon: CalendarCheck2, Form: AboutForm, summary: (s) => s.content.heading },
  gallery: { icon: Images, Form: GalleryForm, summary: (s) => count(s.content.images.length, "photo") },
  testimonials: {
    icon: MessageSquareQuote,
    Form: TestimonialsForm,
    summary: (s) => count(s.content.items.length, "testimonial"),
  },
  faq: { icon: HelpCircle, Form: FaqForm, summary: (s) => count(s.content.items.length, "question") },
  hours: { icon: Clock3, Form: HoursForm, summary: (s) => s.content.heading },
  cta: { icon: Megaphone, Form: CtaForm, summary: (s) => s.content.headline },
  contact: { icon: Phone, Form: ContactForm, summary: (s) => s.content.heading },
};

export function editorFor<T extends SiteSectionType>(type: T): SectionEditor<T> {
  return SECTION_EDITORS[type];
}
