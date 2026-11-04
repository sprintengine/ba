"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { mapLink } from "@/lib/site/plan";
import { cn } from "@/lib/utils";
import { EmptyHint, SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { useSiteRender } from "../site-render-context";
import { CARD, CARD_HOVER } from "../theme-classes";
import type { SectionProps } from "./types";

export function ContactSection({ section, anchor }: SectionProps<"contact">) {
  const { business, theme } = useSiteRender();
  const c = section.content;
  const address = [
    business.address.line1,
    business.address.line2,
    business.address.city,
    business.address.postcode,
  ]
    .filter(Boolean)
    .join(", ");
  const channels = [
    c.showPhone &&
      business.contactPhone && {
        icon: Phone,
        label: "Call",
        value: business.contactPhone,
        href: `tel:${business.contactPhone.replace(/\s+/g, "")}`,
      },
    c.showEmail &&
      business.contactEmail && {
        icon: Mail,
        label: "Email",
        value: business.contactEmail,
        href: `mailto:${business.contactEmail}`,
      },
    c.showAddress &&
      address && {
        icon: MapPin,
        label: "Visit",
        value: address,
        href: mapLink([business.name, address]) ?? undefined,
      },
  ].filter((x): x is { icon: typeof Phone; label: string; value: string; href: string } => !!x);
  return (
    <SectionShell anchor={anchor} sectionId={section.id}>
      <SiteContainer className="flex flex-col gap-10">
        <SectionIntro heading={c.heading} intro={c.body} />
        {channels.length === 0 ? (
          <EmptyHint title="No contact details">
            Add a phone number, email or address in Settings → General.
          </EmptyHint>
        ) : (
          <ul
            className={cn(
              "grid gap-4",
              channels.length > 1 && "@3xl:grid-cols-2",
              channels.length > 2 && "@5xl:grid-cols-3",
            )}
          >
            {channels.map((ch) => (
              <li key={ch.label}>
                <a
                  href={ch.href}
                  {...(ch.label === "Visit" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={cn(
                    "focus-ring flex h-full items-start gap-4 p-6",
                    CARD[theme.card],
                    CARD_HOVER[theme.card],
                    theme.card === "hairline" && "px-0",
                  )}
                >
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
                    <ch.icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-muted-foreground">{ch.label}</span>
                    <span className="font-semibold break-words">{ch.value}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </SiteContainer>
    </SectionShell>
  );
}
