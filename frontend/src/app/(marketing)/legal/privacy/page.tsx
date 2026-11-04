import type { Metadata } from "next";
import { LegalDocument, Tbc, type LegalSection } from "@/components/marketing/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy (draft)",
  description:
    "Draft privacy policy for bookanything. Not yet reviewed by a solicitor and not legally binding.",
  alternates: { canonical: "/legal/privacy" },
  robots: { index: false },
};

const SUB_PROCESSORS = [
  { what: "Hosting and database", why: "Running the service and storing data", where: "EU region" },
  { what: "Authentication provider", why: "Sign-in and account security", where: <Tbc /> },
  { what: "Payment processor", why: "Card payments for bookings and our subscriptions", where: <Tbc /> },
  { what: "Email delivery provider", why: "Confirmations, reminders and account emails", where: <Tbc /> },
  { what: "SMS provider", why: "Text reminders, where a business enables them", where: <Tbc /> },
  { what: "AI model provider", why: "AI setup drafts from a business description", where: <Tbc /> },
  { what: "Error monitoring", why: "Finding and fixing faults", where: <Tbc /> },
];

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          bookanything (&ldquo;bookanything&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides online
          booking software for businesses at bookanything.ie. This policy explains how we handle personal data
          when you use the service, whether you run a business on bookanything or book with one.
        </p>
        <p>
          Legal entity, registered number and registered address: <Tbc />.
        </p>
      </>
    ),
  },
  {
    id: "roles",
    title: "Controller and processor",
    body: (
      <>
        <p>Under the GDPR, who is responsible for your data depends on how you use bookanything:</p>
        <ul>
          <li>
            <strong>Businesses using bookanything</strong> are the <strong>controllers</strong> of their
            customers&apos; data: bookings, contact details and answers to booking questions. They decide what
            they collect and why.
          </li>
          <li>
            <strong>bookanything is their processor.</strong> We store and process that data only to provide
            the service, on the business&apos;s documented instructions, under a data processing agreement{" "}
            <Tbc>DPA to be published</Tbc>.
          </li>
          <li>
            <strong>bookanything is a controller</strong> for the data of people who hold an account with us
            (business owners, team members and customers who create an account), for billing, security and
            running our own business.
          </li>
        </ul>
        <p>
          If you booked with a business and have a question about your booking data, please contact that
          business first. We&apos;ll help them respond.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Data we collect",
    body: (
      <>
        <h3>If you run a business on bookanything</h3>
        <ul>
          <li>Account details: name, email address, and sign-in information.</li>
          <li>
            Business details: name, address, opening hours, services, prices, team members and branding.
          </li>
          <li>
            Billing details for your subscription. Card details are handled by our payment processor, not us.
          </li>
        </ul>
        <h3>If you make a booking</h3>
        <ul>
          <li>Your name, email address and, where the business asks for it, phone number.</li>
          <li>The booking itself: service, time, price, payment status and any changes.</li>
          <li>Answers to the business&apos;s booking questions, which may include sensitive information.</li>
          <li>
            Payment information, processed by the payment processor on the business&apos;s own account. We see
            the payment status and amount, not your card number.
          </li>
        </ul>
        <h3>From everyone</h3>
        <ul>
          <li>
            Technical data: IP address, browser type, and logs needed to keep the service secure and working.
          </li>
          <li>Messages you send us.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use data, and our legal bases",
    body: (
      <>
        <ul>
          <li>
            <strong>To provide the service</strong> (contract): creating bookings, sending confirmations and
            reminders, taking payments and applying cancellation policies.
          </li>
          <li>
            <strong>To keep it secure and reliable</strong> (legitimate interests): preventing abuse, fixing
            faults, and keeping an audit trail of changes.
          </li>
          <li>
            <strong>To meet legal obligations</strong> (legal obligation): for example tax and accounting
            records for our subscriptions.
          </li>
          <li>
            <strong>To send product news</strong> (consent), only if you opt in. You can opt out at any time.
          </li>
        </ul>
        <p>We do not sell personal data, and we do not use booking data for advertising.</p>
      </>
    ),
  },
  {
    id: "sensitive",
    title: "Sensitive information",
    body: (
      <>
        <p>
          Some businesses, such as clinics, may ask questions whose answers reveal health information, which
          is a special category of personal data. The business is responsible for having a lawful basis to
          collect it.
        </p>
        <p>Answers to questions a business marks as sensitive are:</p>
        <ul>
          <li>visible only to that business&apos;s staff;</li>
          <li>left out of confirmation and reminder emails;</li>
          <li>never sent to AI models.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <>
        <p>
          When a business uses AI setup, the description or website address they provide is sent to our AI
          model provider to draft services, prices and hours. We do not send customer data or sensitive
          answers to AI models.
        </p>
        <p>
          Model provider data retention and training settings: <Tbc />.
        </p>
      </>
    ),
  },
  {
    id: "sub-processors",
    title: "Sub-processors",
    body: (
      <>
        <p>
          We use carefully chosen service providers to run bookanything. The list will be published in full:
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead className="bg-surface-sunken text-left text-xs text-subtle-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Service
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Purpose
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Location
                </th>
              </tr>
            </thead>
            <tbody>
              {SUB_PROCESSORS.map((s) => (
                <tr key={s.what} className="border-t border-border-subtle">
                  <td className="px-4 py-2.5 font-medium">{s.what}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.why}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>We&apos;ll give businesses notice before adding or replacing a sub-processor.</p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        We aim to store and process data within the European Economic Area. Where a provider processes data
        outside the EEA, we rely on safeguards recognised under the GDPR, such as the European
        Commission&apos;s Standard Contractual Clauses. Details for each provider: <Tbc />.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <>
        <ul>
          <li>
            Account and business data: for as long as the account is open, then deleted after <Tbc />.
          </li>
          <li>
            Booking data: as long as the business keeps it. Businesses can erase a customer&apos;s data at any
            time.
          </li>
          <li>Billing records: as long as tax law requires.</li>
          <li>
            Security logs: <Tbc />.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the GDPR you have the right to:</p>
        <ul>
          <li>access the personal data held about you;</li>
          <li>have inaccurate data corrected;</li>
          <li>have your data erased;</li>
          <li>restrict or object to certain processing;</li>
          <li>receive your data in a portable format;</li>
          <li>withdraw consent at any time, where we rely on consent.</li>
        </ul>
        <p>
          To exercise these rights, contact us (or, for booking data, the business you booked with). You can
          also complain to the Data Protection Commission in Ireland, or the supervisory authority where you
          live.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data is encrypted in transit. Each business&apos;s data is kept separate from every other
        business&apos;s, access is limited by role, and changes are recorded in an audit log. Further detail
        on our security measures: <Tbc />.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use cookies and similar storage that are strictly necessary for signing in and keeping you signed
        in. We don&apos;t use advertising cookies. If we add analytics, we&apos;ll update this section and ask
        for consent where required. Full cookie list: <Tbc />.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        bookanything is not directed at children. Where a booking is for a child (a music lesson, say), the
        parent or guardian makes it and provides the information.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>We&apos;ll post any changes here and, for significant changes, tell account holders by email.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about privacy: <a href="mailto:hello@bookanything.ie">hello@bookanything.ie</a>. Data
        protection contact and postal address: <Tbc />.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="How bookanything handles personal data for the businesses that use it and the people who book with them."
      sections={SECTIONS}
      related={{ href: "/legal/terms", label: "Terms of Service" }}
    />
  );
}
