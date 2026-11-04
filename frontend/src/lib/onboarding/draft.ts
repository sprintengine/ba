/** Creating an onboarding draft from an API setup (template or AI) and exporting it as the create request. */
import type { BusinessSetup, Me, Membership, Vocabulary } from "@/lib/api/types";
import { DEFAULT_LOCALE } from "@/lib/format/locale";
import { slugify } from "@/lib/slug";
import { sortHours } from "./hours";
import type { SetupDraft } from "./types";

const DEFAULT_VOCABULARY: Vocabulary = {
  resource: "Staff member",
  resources: "Staff",
  customer: "Customer",
  customers: "Customers",
  booking: "Booking",
  bookings: "Bookings",
};

/** Slug derived from the business name; empty while the name is empty. */
export function deriveSlug(name: string): string {
  return name.trim() ? slugify(name) : "";
}

/**
 * Fills anything the API left out so the editor can rely on complete objects. The input is template or model output
 * that may omit fields its type declares, so the guards below are needed although the types say otherwise.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-condition -- untrusted API/AI output, see above */
function normalizeSetup(raw: BusinessSetup): BusinessSetup {
  return {
    ...raw,
    name: raw.name ?? "",
    slug: raw.slug ?? null,
    industry: raw.industry || "generic",
    description: raw.description ?? null,
    timezone: raw.timezone || "Europe/Dublin",
    currency: raw.currency || "EUR",
    locale: raw.locale || DEFAULT_LOCALE,
    country: raw.country || "IE",
    vocabulary: { ...DEFAULT_VOCABULARY, ...raw.vocabulary },
    branding: {
      primaryColor: raw.branding?.primaryColor || "#4f46e5",
      logoUrl: raw.branding?.logoUrl ?? null,
      coverImageUrl: raw.branding?.coverImageUrl ?? null,
    },
    policies: raw.policies,
    customerGroups: (raw.customerGroups ?? []).map((g) => ({
      ...g,
      description: g.description ?? null,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- may be missing despite the type
      restricted: !!g.restricted,
    })),
    resources: (raw.resources ?? []).map((r) => ({
      ...r,
      description: r.description ?? null,
      capacity: r.capacity ?? 1,
      weeklyHours: sortHours(
        (r.weeklyHours ?? []).map((h) => ({ ...h, audienceGroupKeys: h.audienceGroupKeys ?? [] })),
      ),
    })),
    services: (raw.services ?? []).map((s) => ({
      ...s,
      description: s.description ?? null,
      category: s.category ?? null,
      depositCents: s.depositCents ?? null,
      options: s.options ?? [],
      addons: s.addons ?? [],
      requirements: s.requirements ?? [],
      allowedGroupKeys: s.allowedGroupKeys ?? [],
    })),
    questions: (raw.questions ?? []).map((q) => ({
      ...q,
      helpText: q.helpText ?? null,
      options: q.options ?? [],
      serviceName: q.serviceName ?? null,
    })),
  };
}
/* eslint-enable @typescript-eslint/no-unnecessary-condition */

export function createDraft(raw: BusinessSetup): SetupDraft {
  const setup = normalizeSetup(raw);
  const slugEdited = !!setup.slug;
  return { setup: { ...setup, slug: setup.slug || deriveSlug(setup.name) || null }, slugEdited };
}

/** Trimmed text, or null when empty. */
const optional = (v: string | null) => (v?.trim() ? v.trim() : null);

/** The request body for `POST /v1/businesses`: trimmed text, empty optionals as null. */
export function toCreateInput(setup: BusinessSetup): BusinessSetup {
  return {
    ...setup,
    name: setup.name.trim(),
    slug: setup.slug?.trim() || null,
    description: optional(setup.description),
    customerGroups: setup.customerGroups.map((g) => ({
      ...g,
      name: g.name.trim(),
      description: optional(g.description),
    })),
    resources: setup.resources.map((r) => ({
      ...r,
      name: r.name.trim(),
      description: optional(r.description),
    })),
    services: setup.services.map((s) => ({
      ...s,
      name: s.name.trim(),
      description: optional(s.description),
      category: optional(s.category),
      depositCents: s.paymentMode === "deposit" ? s.depositCents : null,
      options: s.options.map((o, i) => ({
        ...o,
        name: o.name.trim(),
        description: optional(o.description),
        sortOrder: i,
      })),
      addons: s.addons.map((a, i) => ({
        ...a,
        name: a.name.trim(),
        description: optional(a.description),
        sortOrder: i,
      })),
      requirements: s.requirements.map((r) => ({ ...r, label: r.label.trim() })),
    })),
    questions: setup.questions.map((q) => ({
      ...q,
      label: q.label.trim(),
      helpText: optional(q.helpText),
      options: q.kind === "select" ? q.options.map((o) => o.trim()) : [],
      serviceName: q.serviceName?.trim() || null,
    })),
  };
}

/**
 * The business a create request made although its response never arrived (a retry then fails with SLUG_TAKEN, or
 * the first try with a network error): an owner membership with the requested slug that wasn't among [known], the
 * businesses the user had before. Null when there is none, or no slug was requested.
 */
export function createdBusinessIn(
  me: Pick<Me, "memberships">,
  known: ReadonlySet<string>,
  slug: string | null,
): Membership | null {
  if (!slug) return null;
  return (
    me.memberships.find((m) => m.role === "owner" && m.slug === slug && !known.has(m.businessId)) ?? null
  );
}
