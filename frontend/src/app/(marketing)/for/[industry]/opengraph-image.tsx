import { priceLabel } from "@/lib/booking/quote";
import { INDUSTRIES } from "@/components/shells/industries";
import { industryContent } from "@/components/marketing/industry-content";
import { OG_SIZE, renderOgCard } from "@/components/marketing/og-card";

export const alt = "bookanything industry template";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ industry: i.slug }));
}

export default async function IndustryOpenGraphImage({ params }: { params: Promise<{ industry: string }> }) {
  const content = industryContent((await params).industry);
  if (!content) {
    return renderOgCard({ title: "Let your clients book themselves in.", subtitle: "", chips: [] });
  }
  return renderOgCard({
    eyebrow: content.hero.eyebrow,
    title: content.hero.title,
    subtitle: "Free to start. 0% platform fee on payments.",
    chips: content.services.slice(0, 3).map((s) => `${s.name} · ${priceLabel(s, "EUR")}`),
    accent: content.color,
  });
}
