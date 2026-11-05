import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, MessageSquareText, Percent, RotateCcw } from "lucide-react";
import { CtaBand } from "@/components/marketing/cta-band";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { PlanCards } from "@/components/marketing/pricing/plan-cards";
import { PlanComparison } from "@/components/marketing/pricing/plan-comparison";
import { WorkedExample } from "@/components/marketing/pricing/worked-example";
import { Container, FeatureIcon, Section, SectionHeader } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free to start. Pro is €12 and Business €39 a month per location, however big your team. 0% platform fee on payments on every plan.",
  alternates: { canonical: "/pricing" },
};

const PROMISES = [
  {
    icon: Percent,
    title: "0% platform fee",
    body: "On every plan, including Free. We never take a cut of a booking.",
  },
  {
    icon: CreditCard,
    title: "Paid into your Stripe",
    body: "You're the merchant of record. Stripe's standard processing fees apply.",
  },
  {
    icon: MessageSquareText,
    title: "SMS at cost",
    body: "Text reminders are billed at what the SMS provider charges us. No markup.",
  },
  {
    icon: RotateCcw,
    title: "Cancel any time",
    body: "Monthly plans, no contract. Move down to Free whenever you like.",
  },
];

const FAQ: FaqItem[] = [
  {
    question: "How do payments work?",
    answer: (
      <>
        <p>
          You connect your own Stripe account (it takes a few minutes). When a customer pays for a booking,
          the charge is made on your account: you&apos;re the merchant of record and the money goes straight
          to you.
        </p>
        <p>bookanything takes 0% of it, on every plan.</p>
      </>
    ),
  },
  {
    question: "So what does it cost me per payment?",
    answer: (
      <p>
        Only Stripe&apos;s standard card processing fee, which Stripe charges you directly. It depends on your
        Stripe account and the customer&apos;s card; we don&apos;t add anything on top.
      </p>
    ),
  },
  {
    question: "How do refunds work?",
    answer: (
      <>
        <p>
          You set a cancellation policy: how much notice customers must give, and what they get back if they
          cancel late (nothing, half or everything). Cancellations are then refunded automatically. If you
          cancel a booking, the customer always gets a full refund.
        </p>
        <p>Note that Stripe doesn&apos;t return its processing fee on refunds.</p>
      </>
    ),
  },
  {
    question: "What counts as a location?",
    answer: (
      <p>
        A place where you take bookings, with its own address and hours: a clinic, a car wash, a studio. Each
        location on a paid plan is billed separately. Your whole team works across them at no extra cost.
      </p>
    ),
  },
  {
    question: "What happens if I go over 100 bookings on Free?",
    answer: (
      <p>
        Nothing is lost. New online bookings pause for the rest of the month and customers see a short message
        instead. Bookings you already have carry on as normal, and if you upgrade to Pro, online booking opens
        again straight away.
      </p>
    ),
  },
  {
    question: "Where is my data stored? Is it GDPR compliant?",
    answer: (
      <p>
        We&apos;re building bookanything for EU businesses, with EU hosting and GDPR in mind from the start.
        You are the controller of your customers&apos; data and we act as your processor. Answers you mark as
        sensitive are only visible to your team and are never sent to AI models. See the draft{" "}
        <Link href="/legal/privacy">privacy policy</Link>.
      </p>
    ),
  },
  {
    question: "Can I cancel any time?",
    answer: (
      <p>
        Yes. Plans are monthly with no contract. If you cancel, your business moves to the Free plan and you
        keep your data.
      </p>
    ),
  },
  {
    question: "Are these prices final?",
    answer: (
      <p>
        They&apos;re our launch prices, in euro and excluding VAT. We may adjust them before general
        availability, and we&apos;ll give existing customers notice before any change.
      </p>
    ),
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute top-[-22rem] left-1/2 size-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--color-iris-200)_0%,transparent_60%)] opacity-40 blur-3xl dark:opacity-15"
        />
        <Container className="relative pt-16 pb-14 sm:pt-24 sm:pb-16">
          <SectionHeader
            as="h1"
            align="center"
            eyebrow="Pricing"
            title="A flat monthly price, and we never take a cut of your bookings."
            description="Start on Free. Paid plans are priced per location, so adding staff doesn't cost extra. 0% platform fee on payments on every plan."
            className="animate-rise"
          />
        </Container>
      </section>

      <Container>
        <PlanCards />
        <p className="mt-5 text-center text-xs text-subtle-foreground">
          Launch pricing in euro, excluding VAT. Prices may change before general availability.
        </p>

        <ul className="mt-16 grid gap-8 border-y border-border-subtle py-10 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <FeatureIcon>
                <Icon />
              </FeatureIcon>
              <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>

      <Section aria-labelledby="example-title">
        <SectionHeader
          id="example-title"
          eyebrow="The maths"
          title="What a three-person clinic would pay each month."
          description="Per-seat tools cost more every time you take someone on, and commission platforms take more as you get busier. Our price stays the same either way."
        />
        <div className="mt-12">
          <WorkedExample />
        </div>
      </Section>

      <Section aria-labelledby="compare-title" className="pt-0 sm:pt-0">
        <SectionHeader id="compare-title" eyebrow="Compare plans" title="What's in each plan." />
        <div className="mt-10">
          <PlanComparison />
        </div>
      </Section>

      <Section id="faq" aria-labelledby="faq-title" className="border-t border-border-subtle">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <SectionHeader
            id="faq-title"
            eyebrow="FAQ"
            title="Questions about pricing."
            description={
              <>
                Anything else? Email{" "}
                <a
                  className="text-brand underline underline-offset-4 hover:decoration-2"
                  href="mailto:hello@bookanything.ie"
                >
                  hello@bookanything.ie
                </a>
                .
              </>
            }
          />
          <Faq items={FAQ} />
        </div>
      </Section>

      <CtaBand
        variant="primary"
        title="Start on Free and upgrade when you're busy."
        description="Free covers up to 100 bookings a month, and you don't need a card to sign up."
        secondary={{ href: "/#features", label: "See features" }}
      />
    </>
  );
}
