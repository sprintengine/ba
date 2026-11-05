import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { formatDuration, formatMoney } from "@/lib/format";
import { priceLabel } from "@/lib/booking/quote";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findIndustry, INDUSTRIES } from "@/components/shells/industries";
import { CtaBand } from "@/components/marketing/cta-band";
import { IndustryPreview } from "@/components/marketing/industry/industry-preview";
import { IndustryCards } from "@/components/marketing/industry-cards";
import {
  industryContent,
  PAYMENT_MODE_LABEL,
  templateSignUpHref,
} from "@/components/marketing/industry-content";
import type { ExampleService } from "@/components/marketing/industries/types";
import { Container, Eyebrow, FeatureIcon, Section, SectionHeader } from "@/components/marketing/section";

type Props = { params: Promise<{ industry: string }> };

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ industry: i.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry } = await params;
  const content = industryContent(industry);
  if (!content) return { title: "Industries" };
  return {
    title: content.meta.title,
    description: content.meta.description,
    alternates: { canonical: `/for/${industry}` },
  };
}

export default async function IndustryPage({ params }: Props) {
  const { industry } = await params;
  const meta = findIndustry(industry);
  const content = industryContent(industry);
  if (!meta || !content) notFound();

  const signUp = templateSignUpHref(content.templateKey);
  const { vocabulary: v } = content;

  return (
    <BusinessThemeProvider primaryColor={content.color}>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute top-[-16rem] left-[-10rem] size-[44rem] rounded-full bg-brand-soft opacity-70 blur-3xl dark:opacity-40"
        />
        <Container className="relative grid items-start gap-14 pt-14 pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16 lg:pb-28">
          <div className="flex animate-rise flex-col lg:sticky lg:top-28">
            <Eyebrow>
              <content.icon /> {content.hero.eyebrow}
            </Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-display-sm lg:text-display">
              {content.hero.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground sm:leading-8">
              {content.hero.description}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="brand" size="lg">
                <Link href={signUp}>
                  Start with the {content.templateLabel} template <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <ul className="mt-9 flex flex-col gap-2.5 text-sm">
              {content.hero.points.map((p) => (
                <li key={p} className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
                    <Check className="size-3" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <dl className="mt-12 grid max-w-lg grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle py-5 max-sm:hidden">
              {[
                { value: "0%", label: "platform fee on payments" },
                { value: "€0", label: "to start, no card needed" },
                { value: "Minutes", label: "from sign-up to your link" },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col-reverse gap-1 px-4 first:pl-0">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="tnum text-xl font-semibold tracking-tight">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative animate-rise [animation-delay:120ms]">
            <p className="mb-3 text-center text-xs text-subtle-foreground">
              Have a go. This is the booking page your {v.customers.toLowerCase()} would see.
            </p>
            <IndustryPreview slug={content.slug} />
          </div>
        </Container>
      </section>

      {/* What the template sets up */}
      <Section
        aria-labelledby="template-title"
        className="border-y border-border-subtle bg-surface-sunken/50"
      >
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <SectionHeader
              id="template-title"
              eyebrow="The template"
              title={`Ready-made for ${meta.short.toLowerCase()}.`}
              description="You start with typical services, prices, opening hours and booking questions, and change whatever doesn't suit."
            />
            <dl className="mt-10 flex flex-wrap gap-3">
              {[
                { term: "Resources", value: v.resources },
                { term: "Customers", value: v.customers },
                { term: "Bookings", value: `${v.booking}s` },
              ].map((x) => (
                <div key={x.term} className="rounded-xl border border-border bg-surface p-3.5 shadow-xs">
                  <dt className="text-2xs text-subtle-foreground">{x.term}</dt>
                  <dd className="mt-1 text-sm font-medium">{x.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-subtle-foreground">
              Your words for our building blocks, used across your booking page and dashboard.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {content.services.map((s) => (
              <ServiceRow key={s.name} service={s} />
            ))}
          </ul>
        </div>
      </Section>

      {/* Features */}
      <Section aria-labelledby="features-title">
        <SectionHeader
          id="features-title"
          eyebrow="Features"
          title={`What it does for ${meta.short.toLowerCase()}.`}
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.features.map((f) => (
            <li
              key={f.title}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-xs"
            >
              <div className="flex items-center justify-between gap-3">
                <FeatureIcon>
                  <f.icon />
                </FeatureIcon>
                {f.comingSoon && <Badge tone="outline">Coming soon</Badge>}
              </div>
              <h3 className="mt-1 text-base font-semibold tracking-tight">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* How it works */}
      <Section aria-labelledby="how-title" className="pt-0 sm:pt-0">
        <div className="rounded-3xl border border-border bg-surface p-7 shadow-xs sm:p-10">
          <SectionHeader id="how-title" eyebrow="How it works" title="Three steps to your first booking." />
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Sign up and pick the template",
                body: `Your ${v.resources.toLowerCase()}, services, hours and questions arrive pre-filled for ${meta.short.toLowerCase()}.`,
              },
              {
                title: "Make it yours",
                body: "Add your team's names, adjust prices and hours, set your cancellation policy and connect Stripe.",
              },
              {
                title: "Share your link",
                body: `Put bookanything.ie/your-name on your website and socials. ${v.customers} book in under a minute.`,
              },
            ].map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3">
                <span className="tnum flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground shadow-button">
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* Other industries (they keep their own colours) */}
      <Section aria-labelledby="others-title" className="border-t border-border-subtle">
        <SectionHeader
          id="others-title"
          eyebrow="Other templates"
          title="Templates for other kinds of business."
        />
        <div className="mt-10">
          <IndustryCards exclude={content.slug} />
        </div>
      </Section>

      <CtaBand
        title={`Start with the ${content.templateLabel} template.`}
        description="Free to start, no card required. 0% platform fee on payments, always."
        primary={{ href: signUp, label: "Start for free" }}
      />
    </BusinessThemeProvider>
  );
}

function ServiceRow({ service: s }: { service: ExampleService }) {
  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {s.name}
            {s.restriction && <Badge tone="brand">{s.restriction}</Badge>}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-sm font-semibold">{priceLabel(s, "EUR")}</p>
          <p className="tnum text-xs text-muted-foreground">{formatDuration(s.durationMinutes)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">
          {s.paymentMode === "deposit" && s.depositCents
            ? `${formatMoney(s.depositCents, "EUR")} deposit online`
            : PAYMENT_MODE_LABEL[s.paymentMode]}
        </Badge>
        {s.options?.map((o) => (
          <Badge key={o.name} tone="outline" className="tnum font-normal">
            {/* An option named for its length ("30 minutes") shouldn't say it twice. */}
            {/\d/.test(o.name) ? o.name : `${o.name} · ${formatDuration(o.durationMinutes)}`} ·{" "}
            {formatMoney(o.priceCents, "EUR")}
          </Badge>
        ))}
        {s.addons?.map((a) => (
          <Badge key={a.name} tone="outline" className="tnum font-normal">
            + {a.name} · {formatMoney(a.priceCents, "EUR")}
          </Badge>
        ))}
      </div>
    </li>
  );
}
