import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Percent, RotateCcw, Users } from "lucide-react";
import { CtaBand } from "@/components/marketing/cta-band";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { PlanCards, PlanNotes } from "@/components/marketing/pricing/plan-cards";
import { PlanComparison } from "@/components/marketing/pricing/plan-comparison";
import { WorkedExample } from "@/components/marketing/pricing/worked-example";
import { Container, FeatureIcon, Section, SectionHeader } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free until you're busy. You pay for bookings, not people: Free for 100 bookings a month, Pro €10 for 1,000, Business €49 for 10,000. Unlimited staff and appointment types on every plan.",
  alternates: { canonical: "/pricing" },
};

const PROMISES = [
  {
    icon: Users,
    title: "Unlimited staff",
    body: "On every plan, including Free. Adding a person never costs extra.",
  },
  {
    icon: Layers,
    title: "Unlimited appointment types",
    body: "Every kind of appointment, on every plan. You choose which staff do which.",
  },
  {
    icon: Percent,
    title: "0% platform fee",
    body: "We never take a cut of a booking. Your provider's usual card fee applies.",
  },
  {
    icon: RotateCcw,
    title: "Cancel any time",
    body: "Monthly plans, no contract. Move down to Free whenever you like.",
  },
];

/** Who the free plan is for: the people the pricing is built around. */
const STARTERS = [
  {
    title: "Working on your own",
    body: "Every kind of appointment and your own booking page, free until you pass 100 bookings a month. Most booking software charges per person, so a team costs more every time you grow. Here it doesn't.",
  },
  {
    title: "Starting a business with AI",
    body: "Build your own site with AI and plug our booking in for free. Connect your own assistant, on every plan, and it can run the rest.",
  },
];

const FAQ: FaqItem[] = [
  {
    question: "How do payments work?",
    answer: (
      <>
        <p>
          You connect your own payment provider (it takes a few minutes). When a customer pays for a booking,
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
        Only your provider&apos;s standard card processing fee, which it charges you directly. It depends on
        your provider and the customer&apos;s card; we don&apos;t add anything on top.
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
        <p>Note that payment providers don&apos;t usually return their processing fee on refunds.</p>
      </>
    ),
  },
  {
    question: "Does it cost more to add staff?",
    answer: (
      <p>
        No. Every plan is one price per business, with unlimited staff and unlimited appointment types, Free
        included. You pay for bookings, not people.
      </p>
    ),
  },
  {
    question: "What happens if I go over my plan's bookings?",
    answer: (
      <p>
        Nothing is lost. New online bookings pause for the rest of the month and customers see a short message
        instead. Bookings you already have carry on as normal, and if you move up a plan, online booking opens
        again straight away. Above 10,000 bookings a month, talk to us.
      </p>
    ),
  },
  {
    question: "Can I use it with a site I built myself?",
    answer: (
      <p>
        Yes, on every plan. If you built your site with AI, or any other way, plug our booking into it for
        free and clients book without leaving.
      </p>
    ),
  },
  {
    question: "Is AI included?",
    answer: (
      <p>
        Connecting your own AI assistant is included on every plan. Our built-in assistant is a paid add-on,
        sold as monthly credits.
      </p>
    ),
  },
  {
    question: "Where is my data stored? Is it GDPR compliant?",
    answer: (
      <p>
        bookanything is built for EU businesses, with EU hosting and GDPR in mind from the start. You are the
        controller of your customers&apos; data and we act as your processor. Answers you mark as sensitive
        are only visible to your team and are never sent to AI models. See the{" "}
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
            title={
              <>
                Free until you&apos;re busy.
                <br />
                You pay for bookings, not people.
              </>
            }
            description="Most booking software charges per person. Every plan here has unlimited staff and unlimited appointment types, and 0% platform fee on payments."
            className="animate-rise"
          />
        </Container>
      </section>

      <Container>
        <PlanCards />
        <div className="mt-6">
          <PlanNotes />
        </div>
        <p className="mt-3 text-center text-xs text-subtle-foreground">
          Launch pricing in euro, excluding VAT. Prices may change before general availability.
        </p>

        <ul className="mt-14 grid gap-4 md:grid-cols-2">
          {STARTERS.map((s) => (
            <li key={s.title} className="rounded-2xl bg-surface-sunken p-6 sm:p-7">
              <h2 className="font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ul>

        <ul className="mt-14 grid gap-8 border-y border-border-subtle py-10 sm:grid-cols-2 lg:grid-cols-4">
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
          description="Most booking software charges per person, so it costs more every time you take someone on. Commission platforms take more as you get busier. You pay for bookings, not people."
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
                  className="font-medium text-foreground underline underline-offset-4 hover:decoration-2"
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
        title="Free until you're busy."
        description="Free covers 100 bookings a month, and you don't need a card to sign up."
        secondary={{ href: "/#features", label: "See features" }}
      />
    </>
  );
}
