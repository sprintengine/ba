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
          We don&apos;t take a percentage of your bookings. Customers pay through your payment provider into
          your own account, and the provider charges its standard card processing fee.
        </p>
        <p>We make our money from the flat monthly plan for each location, and nothing else.</p>
      </>
    ),
  },
  {
    question: "Which payment providers can I use?",
    answer: (
      <p>
        Stripe, PayPal, Klarna, Mollie, Adyen and Revolut, with Apple Pay, Google Pay and every major card on
        top. You only need one, and only to take payments online: connecting it takes a few minutes during
        setup. Until then, you can offer free bookings or have customers pay when they arrive.
      </p>
    ),
  },
  {
    question: "Do my customers need to create an account?",
    answer: (
      <p>
        No. Customers can book as guests and manage their booking from the link in their confirmation email.
        If they do create an account, they can see all their bookings with every business in one place.
      </p>
    ),
  },
  {
    question: "How does AI setup work, and what does it see?",
    answer: (
      <p>
        You describe your business, or paste your website address, and AI drafts your services, prices,
        opening hours, team, rooms and booking questions. You check all of it before anything goes live.
        Answers to questions you mark as sensitive are never sent to an AI model.
      </p>
    ),
  },
  {
    question: "My business isn't a physio, car wash, music school or GP. Will it work?",
    answer: (
      <p>
        Very likely. Every business is set up from the same parts: services with options and add-ons, people,
        rooms and equipment, customer groups and your own questions. The four industries are just starting
        templates. Describe your business and we&apos;ll draft a setup for it.
      </p>
    ),
  },
  {
    question: "Who owns my customers' data?",
    answer: (
      <p>
        You do. You&apos;re the data controller for your customers; we process their data on your behalf to
        run your bookings. Read the <Link href="/legal/privacy">privacy policy</Link> for the details.
      </p>
    ),
  },
  {
    question: "Can my clients really book through their own AI assistant?",
    answer: (
      <p>
        Yes. Their assistant sees the same times, prices and rules as your booking page, and returns a booking
        card in the chat that they confirm and pay for. It lands on your calendar like any other booking.
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
              Questions we <span className="text-prism">get asked.</span>
            </h2>
            <p className="mt-4 text-base leading-[1.6] text-muted-foreground">
              Can&apos;t find what you&apos;re looking for? Email{" "}
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
