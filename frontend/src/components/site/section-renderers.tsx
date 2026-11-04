"use client";

/**
 * Section block renderers (the public, render-only part of the section registry; the pure part
 * is lib/site/section-meta.ts, with schemas in lib/site/sections.ts, and the editor forms live in
 * components/dashboard/site). Typed over
 * every section type, so a new type fails to compile until it has a renderer.
 */
import type { ComponentType } from "react";
import type { SiteSectionType } from "@/lib/api/types";
import { AboutSection } from "./sections/about-section";
import { ContactSection } from "./sections/contact-section";
import { CtaSection } from "./sections/cta-section";
import { FaqSection } from "./sections/faq-section";
import { GallerySection } from "./sections/gallery-section";
import { HeroSection } from "./sections/hero-section";
import { HoursSection } from "./sections/hours-section";
import { ServicesSection } from "./sections/services-section";
import { TeamSection } from "./sections/team-section";
import { TestimonialsSection } from "./sections/testimonials-section";
import type { SectionProps } from "./sections/types";

export const SECTION_RENDERERS: { [T in SiteSectionType]: ComponentType<SectionProps<T>> } = {
  hero: HeroSection,
  services: ServicesSection,
  team: TeamSection,
  about: AboutSection,
  gallery: GallerySection,
  testimonials: TestimonialsSection,
  faq: FaqSection,
  hours: HoursSection,
  cta: CtaSection,
  contact: ContactSection,
};

/** The renderer for a section type (one typed lookup instead of casts at call sites). */
export function rendererFor<T extends SiteSectionType>(type: T): ComponentType<SectionProps<T>> {
  return SECTION_RENDERERS[type];
}
