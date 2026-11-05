import type { Metadata } from "next";
import Link from "next/link";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { PrismContainer } from "@/components/marketing/landing/heading";
import { AiSection } from "@/components/marketing/landing/home/ai";
import { BookedSection } from "@/components/marketing/landing/home/booked";
import { ClosingSection } from "@/components/marketing/landing/home/closing";
import { Hero } from "@/components/marketing/landing/home/hero";
import { MoneySection } from "@/components/marketing/landing/home/money";
import { ProofSection } from "@/components/marketing/landing/home/proof";
import { SetupSection } from "@/components/marketing/landing/home/setup";
import { IndustriesSection } from "@/components/marketing/landing/industries";
import { PricingTeaser } from "@/components/marketing/landing/pricing-teaser";

export const metadata: Metadata = {
  title: { absolute: "bookanything: online booking for anything bookable" },
  description:
    "Booking software your AI can run. Clients book and pay online, you get one calendar for your staff, rooms and equipment, and the money goes straight to your account with 0% platform fee.",
  alternates: { canonical: "/" },
};

const FAQ: FaqItem[] = [
  {
    question: "What does “0% platform fee” actually mean?",
    answer: (
      <>
        <p>
          We don&apos;t take a percentage of your bookings. Clients pay into your own account through your
          payment provider, and the provider charges its usual card fee.
        </p>
        <p>We make our money from monthly plans, once you&apos;re busy.</p>
      </>
    ),
  },
  {
    question: "Which payment providers can I use?",
    answer: (
      <p>
        Stripe, PayPal, Klarna, Mollie, Adyen and Revolut, plus Apple Pay, Google Pay and all the main cards.
        You only need one, and only if you want to take payments online. It takes a few minutes to connect.
        Until then, clients can book for free or pay when they arrive.
      </p>
    ),
  },
  {
    question: "Do my customers need to create an account?",
    answer: (
      <p>
        No. Clients can book without an account and change their booking from the link in their email. If they
        do make an account, they can see all their bookings in one place.
      </p>
    ),
  },
  {
    question: "Do I need to pay for AI?",
    answer: (
      <p>
        No. Everything works without AI. If you already pay for an assistant like ChatGPT, Claude or Grok,
        connecting it is included on every plan. Our built-in assistant is optional and sold as monthly
        credits.
      </p>
    ),
  },
  {
    question: "How does the AI setup work, and what does it see?",
    answer: (
      <p>
        You describe your business, or paste your website, and AI drafts your services, prices, hours, team,
        rooms and booking questions. You check all of it before anything goes live. Answers you mark as
        private are never sent to an AI.
      </p>
    ),
  },
  {
    question: "My business isn't a physio, car wash, music school or GP. Will it work?",
    answer: (
      <p>
        Very likely. If you work by appointment, it will fit. The four templates are only starting points.
        Describe your business and we&apos;ll draft a setup for it.
      </p>
    ),
  },
  {
    question: "Who owns my customers' data?",
    answer: (
      <p>
        You do. We only use your clients&apos; details to run your bookings. The{" "}
        <Link href="/legal/privacy">privacy policy</Link> has the full story.
      </p>
    ),
  },
  {
    question: "Can my clients really book through their own AI assistant?",
    answer: (
      <p>
        Yes. Their assistant sees the same times and prices as your booking page. They confirm and pay in the
        chat, and it lands on your calendar like any other booking.
      </p>
    ),
  },
  {
    question: "Is there a contract?",
    answer: (
      <p>
        No. Paid plans are monthly and you can cancel at any time. The Free plan stays free for as long as you
        need it.
      </p>
    ),
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <BookedSection />
      <AiSection />
      <MoneySection />
      <ProofSection />
      <SetupSection />
      <IndustriesSection />
      <PricingTeaser />
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 pb-20 sm:pb-28">
        <PrismContainer className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <p className="mb-3 text-[0.9375rem] font-semibold text-muted-foreground">FAQ</p>
            <h2
              id="faq-title"
              className="text-[clamp(2rem,3.4vw,3rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance"
            >
              Common <span className="text-prism">questions.</span>
            </h2>
            <p className="mt-4 text-base leading-[1.6] text-muted-foreground">
              Something else? Email{" "}
              <a
                className="font-medium text-foreground underline underline-offset-4 hover:decoration-2"
                href="mailto:hello@bookanything.ie"
              >
                hello@bookanything.ie
              </a>
              .
            </p>
          </div>
          <Faq items={FAQ} />
        </PrismContainer>
      </section>
      <ClosingSection />
    </>
  );
}
