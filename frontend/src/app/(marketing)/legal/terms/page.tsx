import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, Tbc, type LegalSection } from "@/components/marketing/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service (draft)",
  description:
    "Draft terms of service for bookanything. Not yet reviewed by a solicitor and not legally binding.",
  alternates: { canonical: "/legal/terms" },
  robots: { index: false },
};

const SECTIONS: LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <>
        <p>
          These terms will govern the use of bookanything, online booking software provided by{" "}
          <Tbc>legal entity and registered address</Tbc> (&ldquo;bookanything&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;).
        </p>
        <p>
          They apply to businesses that create an account to take bookings (&ldquo;you&rdquo;). People who
          book with a business use bookanything on that business&apos;s behalf; the booking itself is an
          arrangement between them and the business.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>You must be at least 18 and able to act for the business you register.</li>
        <li>Keep your sign-in details secure. You&apos;re responsible for activity under your account.</li>
        <li>
          You can invite team members as admins or staff. You&apos;re responsible for who you give access to
          and for removing access when it&apos;s no longer needed.
        </li>
        <li>Keep your business details, prices and policies accurate.</li>
      </ul>
    ),
  },
  {
    id: "plans",
    title: "Plans and billing",
    body: (
      <>
        <ul>
          <li>
            The <strong>Free</strong> plan includes up to 100 bookings a month and up to 3 team members, and
            shows a small &ldquo;Powered by bookanything&rdquo; badge on your booking page.
          </li>
          <li>
            <strong>Paid plans</strong> are billed monthly, per location, in advance. Prices exclude VAT,
            which is added where applicable.
          </li>
          <li>You can upgrade, downgrade or cancel at any time. Cancelling moves you to the Free plan.</li>
          <li>
            We&apos;ll give you notice before changing prices for your plan. Notice period: <Tbc />.
          </li>
          <li>
            Refunds of subscription fees: <Tbc />.
          </li>
        </ul>
        <p>
          Current prices are on the <Link href="/pricing">pricing page</Link>.
        </p>
      </>
    ),
  },
  {
    id: "payments",
    title: "Payments from your customers",
    body: (
      <>
        <p>
          To take payments online you connect your own account with our payment processor (currently Stripe,
          through Stripe Connect). By doing so you also agree to that processor&apos;s terms.
        </p>
        <ul>
          <li>
            <strong>You are the merchant of record.</strong> Payments are made to your account, not ours.
          </li>
          <li>
            <strong>We charge no platform fee</strong> on payments your customers make. The processor charges
            its own processing fees directly to you.
          </li>
          <li>
            Refunds are issued automatically according to the cancellation policy you set, and in full when
            you cancel a booking. Processing fees may not be returned on refunds.
          </li>
          <li>Chargebacks and disputes are between you, your customer and the processor.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-customers",
    title: "Your responsibilities to your customers",
    body: (
      <ul>
        <li>You&apos;re responsible for the services you provide, your prices and your policies.</li>
        <li>
          Your cancellation and refund policies must be clear to customers and comply with consumer law,
          including applicable Irish and EU consumer protection rules.
        </li>
        <li>
          Only ask booking questions you need, and mark questions that may reveal sensitive information (such
          as health details) as sensitive.
        </li>
        <li>Honour bookings made through your booking page, or cancel them promptly with a full refund.</li>
      </ul>
    ),
  },
  {
    id: "data",
    title: "Data protection",
    body: (
      <p>
        You are the controller of your customers&apos; personal data and we process it on your behalf. Our
        data processing agreement <Tbc>to be published</Tbc> forms part of these terms. See the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link> for how we handle data.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <p>
        AI setup produces a draft for you to review. Drafts can contain mistakes: check services, prices,
        hours and questions before you publish them. You&apos;re responsible for what appears on your booking
        page.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You must not use bookanything to:</p>
        <ul>
          <li>offer anything illegal, or take bookings you have no intention of honouring;</li>
          <li>send spam or collect data you have no right to collect;</li>
          <li>
            interfere with the service, probe it for vulnerabilities without permission, or overload it;
          </li>
          <li>impersonate another business or person.</li>
        </ul>
        <p>We may suspend accounts that break these rules. Where possible, we&apos;ll tell you first.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "Availability and changes",
    body: (
      <p>
        We work hard to keep bookanything available and reliable, but can&apos;t guarantee uninterrupted
        service. Features described as &ldquo;coming soon&rdquo; are plans, not commitments. We may change or
        improve the service over time and will give notice of changes that materially reduce what your plan
        includes. Service levels: <Tbc />.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: (
      <p>
        You keep all rights to your content: your business details, logo, descriptions and data. You give us
        permission to use it only to provide the service. We keep all rights to bookanything itself.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Ending your account",
    body: (
      <p>
        You can close your account at any time. After closure we delete your data in line with the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>. Exporting your data before closure, and deletion
        timelines: <Tbc />.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <p>
        Limitations of liability and indemnities: <Tbc>to be drafted with legal advice</Tbc>. Nothing in these
        terms will limit liability that cannot be limited by law.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are intended to be governed by the laws of Ireland, with disputes subject to the Irish
        courts <Tbc />.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms: <a href="mailto:hello@bookanything.ie">hello@bookanything.ie</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      summary="Draft terms between bookanything and the businesses that use it to take bookings."
      sections={SECTIONS}
      related={{ href: "/legal/privacy", label: "Privacy Policy" }}
    />
  );
}
