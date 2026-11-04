/**
 * Contract drift between the frontend API types (`src/lib/api/types`) and `backend/openapi.yaml`.
 *
 * Each key schema has typed fixtures (`fixtures/`): `full` sets every property, `sparse` sets every nullable one to
 * null and leaves optional ones out. TypeScript checks each fixture against the frontend type (`satisfies`); this test
 * checks the same objects against the spec:
 * - both validate, with every object closed: a property the frontend has and the spec lacks fails, as does a property
 *   the spec requires and the frontend type does not have, or a type, enum or format mismatch;
 * - `full` has every property the spec declares, so the frontend type has them all;
 * - `sparse` is null wherever the spec allows null, so the frontend type accepts null there;
 * - `sparse` sets no property the spec makes optional, unless listed in `requiredByFrontend` (a deliberate choice).
 * Failures name the schema and the path, e.g. `Booking.customer.email`.
 */
import { describe, expect, it } from "vitest";
import type {
  BookingSource,
  BookingStatus,
  BusinessStatus,
  FormQuestionKind,
  GeneratedPattern,
  HeroVariant,
  LocationType,
  MemberRole,
  PaymentMode,
  PaymentStatus,
  Plan,
  ResourceKind,
  SiteSectionType,
  SiteThemeKey,
  SiteVersionSource,
} from "@/lib/api/types";
import { must } from "@/test/must";
import { loadContract } from "./contract/openapi";
import { aiUsage, aiUsageSparse } from "./fixtures/ai";
import {
  availability,
  booking,
  bookingDetail,
  bookingDetailSparse,
  bookingResult,
  bookingResultSparse,
  bookingSparse,
  createPublicBooking,
  createPublicBookingSparse,
  customer,
  customerBooking,
  customerBookingSparse,
  customerSparse,
  managedBooking,
  managedBookingSparse,
  slot,
  slotSparse,
} from "./fixtures/bookings";
import {
  acceptedInvitation,
  acceptedInvitationSparse,
  business,
  businessSparse,
  me,
  meSparse,
  publicBusiness,
  publicBusinessSparse,
  teamMember,
  teamMemberSparse,
} from "./fixtures/business";
import {
  customerGroup,
  formQuestion,
  formQuestionSparse,
  publicService,
  publicServiceSparse,
  resource,
  resourceSparse,
  service,
  serviceSparse,
} from "./fixtures/catalog";
import { invalidRequest, slotUnavailable } from "./fixtures/errors";
import {
  availabilityOverride,
  availabilityOverrideSparse,
  availabilityRule,
  availabilityRuleSparse,
  billing,
  billingSparse,
  customerDetail,
  overview,
  paymentsStatus,
  reportSummary,
  resourceAvailability,
} from "./fixtures/dashboard";
import {
  authorizeConsent,
  authorizeConsentSparse,
  authorizeRedirect,
  connectedApp,
  connectedAppSparse,
  listing,
  listingSparse,
  marketplaceSearchResult,
  marketplaceSearchResultSparse,
  marketplaceSettings,
  marketplaceSettingsSparse,
} from "./fixtures/marketplace";
import {
  bookingOffer,
  offer,
  offerPreview,
  offerSparse,
  publicOffer,
  publicOfferSparse,
  slotOffer,
} from "./fixtures/offers";
import { releaseSchedule, releaseScheduleInput, releaseScheduleSparse, releases } from "./fixtures/releases";
import {
  publicSite,
  sitePlan,
  siteState,
  siteStateSparse,
  siteVersion,
  siteVersionDetail,
  siteVersionSparse,
  stockPhoto,
  stockPhotoSparse,
  upload,
} from "./fixtures/site";
import {
  assistantAction,
  assistantActionSparse,
  assistantState,
  assistantThread,
  memoryEntry,
  memoryEntrySparse,
} from "./fixtures/assistant";
import {
  customerAgentRequest,
  customerAgentRequestSparse,
  customerAgentSettings,
  notification,
  notificationSettings,
  notificationSparse,
  pushDevice,
  pushDeviceInput,
} from "./fixtures/notifications";

type Case = {
  /** The spec schema, when the case is labelled differently (a second variant of a union). */
  schema?: string;
  full: unknown;
  sparse?: unknown;
  /**
   * Spec-optional properties (and everything under them) the frontend type requires on purpose, with the reason in a
   * comment. Usually a schema that is also a request body: responses always carry every field (the backend encodes
   * defaults and explicit nulls), so the frontend may rely on them.
   */
  requiredByFrontend?: string[];
  /** Spec properties the complete fixture leaves out on purpose, with the reason in a comment. */
  absentFromFull?: string[];
};

/** [paths] that no entry of [allowed] covers (an entry covers itself and everything under it). */
function uncovered(paths: string[], allowed: string[]): string[] {
  return paths.filter(
    (path) =>
      !allowed.some(
        (entry) => path === entry || path.startsWith(`${entry}.`) || path.startsWith(`${entry}[`),
      ),
  );
}

const contract = loadContract();

const SCHEMAS: Record<string, Case> = {
  Error: { full: invalidRequest, sparse: slotUnavailable },
  PublicBusiness: { full: publicBusiness, sparse: publicBusinessSparse },
  // The spec composes Business from PublicBusiness, but says the dashboard's Business never carries `site`.
  Business: { full: business, sparse: businessSparse, absentFromFull: ["Business.site"] },
  Me: { full: me, sparse: meSparse },
  AcceptedInvitation: { full: acceptedInvitation, sparse: acceptedInvitationSparse },
  TeamMember: { full: teamMember, sparse: teamMemberSparse },
  Resource: { full: resource, sparse: resourceSparse },
  CustomerGroup: { full: customerGroup },
  FormQuestion: { full: formQuestion, sparse: formQuestionSparse },
  Service: { full: service, sparse: serviceSparse },
  PublicService: { full: publicService, sparse: publicServiceSparse },
  Slot: { full: slot, sparse: slotSparse },
  Availability: { full: availability },
  // A request body: the frontend always sends these (the spec defaults them to empty).
  CreatePublicBooking: {
    full: createPublicBooking,
    sparse: createPublicBookingSparse,
    requiredByFrontend: ["CreatePublicBooking.addonIds", "CreatePublicBooking.answers"],
  },
  CustomerBooking: { full: customerBooking, sparse: customerBookingSparse },
  ManagedBooking: { full: managedBooking, sparse: managedBookingSparse },
  BookingResult: { full: bookingResult, sparse: bookingResultSparse },
  Booking: { full: booking, sparse: bookingSparse },
  BookingDetail: { full: bookingDetail, sparse: bookingDetailSparse },
  Customer: { full: customer, sparse: customerSparse },
  // OfferSchedule is the request's shape too (lists default to empty); responses always carry both lists.
  Offer: {
    full: offer,
    sparse: offerSparse,
    requiredByFrontend: ["Offer.schedule.daysOfWeek", "Offer.schedule.timeWindows"],
  },
  PublicOffer: { full: publicOffer, sparse: publicOfferSparse },
  SlotOffer: { full: slotOffer },
  BookingOffer: { full: bookingOffer },
  ReleaseSchedule: { full: releaseSchedule, sparse: releaseScheduleSparse },
  // A request body: the editor always sends every field (the spec defaults the optional ones).
  ReleaseScheduleInput: {
    full: releaseScheduleInput,
    requiredByFrontend: [
      "ReleaseScheduleInput.everyone",
      "ReleaseScheduleInput.groupIds",
      "ReleaseScheduleInput.daysBefore",
      "ReleaseScheduleInput.weekdaysOnly",
      "ReleaseScheduleInput.weekday",
      "ReleaseScheduleInput.weeksAhead",
      "ReleaseScheduleInput.active",
    ],
  },
  Releases: { full: releases },
  SitePlan: { full: sitePlan },
  PublicSite: { full: publicSite },
  // SitePlan is also what the editor saves (optional fields defaulted); "responses always contain every field".
  SiteState: { full: siteState, sparse: siteStateSparse, requiredByFrontend: ["SiteState.draft"] },
  AiUsage: { full: aiUsage, sparse: aiUsageSparse },
  AvailabilityRule: { full: availabilityRule, sparse: availabilityRuleSparse },
  AvailabilityOverride: { full: availabilityOverride, sparse: availabilityOverrideSparse },
  ResourceAvailability: { full: resourceAvailability },
  CustomerDetail: { full: customerDetail },
  Overview: { full: overview },
  ReportSummary: { full: reportSummary },
  PaymentsStatus: { full: paymentsStatus },
  Billing: { full: billing, sparse: billingSparse },
  Listing: { full: listing, sparse: listingSparse },
  MarketplaceSearchResult: { full: marketplaceSearchResult, sparse: marketplaceSearchResultSparse },
  MarketplaceSettings: { full: marketplaceSettings, sparse: marketplaceSettingsSparse },
  AuthorizeCheck: { full: authorizeConsent, sparse: authorizeConsentSparse },
  "AuthorizeCheck (redirect)": { schema: "AuthorizeCheck", full: authorizeRedirect },
  ConnectedApp: { full: connectedApp, sparse: connectedAppSparse },
  OfferPreview: { full: offerPreview },
  SiteVersion: { full: siteVersion, sparse: siteVersionSparse },
  SiteVersionDetail: { full: siteVersionDetail },
  StockPhoto: { full: stockPhoto, sparse: stockPhotoSparse },
  Upload: { full: upload },
  AssistantState: { full: assistantState },
  AssistantThread: { full: assistantThread },
  AssistantAction: { full: assistantAction, sparse: assistantActionSparse },
  MemoryEntry: { full: memoryEntry, sparse: memoryEntrySparse },
  Notification: { full: notification, sparse: notificationSparse },
  NotificationSettings: { full: notificationSettings },
  CustomerAgentRequest: { full: customerAgentRequest, sparse: customerAgentRequestSparse },
  CustomerAgentSettings: { full: customerAgentSettings },
  PushDevice: { full: pushDevice },
  PushDeviceInput: { full: pushDeviceInput },
};

describe.each(Object.entries(SCHEMAS))("%s matches backend/openapi.yaml", (label, schema) => {
  const name = schema.schema ?? label;
  it("the complete fixture validates against the spec", () => {
    expect(contract.problems(name, schema.full)).toEqual([]);
  });

  it("the frontend type has every property the spec declares", () => {
    expect(contract.missingProperties(name, schema.full)).toEqual(schema.absentFromFull ?? []);
  });

  if (schema.sparse) {
    const sparse = schema.sparse;
    it("the sparse fixture validates against the spec", () => {
      expect(contract.problems(name, sparse)).toEqual([]);
    });

    it("the frontend type accepts null wherever the spec does", () => {
      expect(contract.nonNullNullables(name, sparse)).toEqual([]);
    });

    it("the frontend type requires only what the spec requires", () => {
      const allowed = schema.requiredByFrontend ?? [];
      const present = contract.presentOptionals(name, sparse);
      expect(uncovered(present, allowed)).toEqual([]);
      // Every allowance is still needed.
      expect(allowed.filter((entry) => uncovered(present, [entry]).length === present.length)).toEqual([]);
    });
  }
});

/** Every value of a frontend union, checked exhaustive by the compiler (a `Record` needs every key, and no others). */
const valuesOf = <T extends string>(values: Record<T, true>): T[] => Object.keys(values) as T[];

const ENUMS: Record<string, string[]> = {
  BookingStatus: valuesOf<BookingStatus>({
    held: true,
    pending_approval: true,
    confirmed: true,
    completed: true,
    cancelled: true,
    no_show: true,
    expired: true,
  }),
  PaymentStatus: valuesOf<PaymentStatus>({
    not_required: true,
    pending: true,
    paid: true,
    partially_refunded: true,
    refunded: true,
    failed: true,
    pay_at_venue: true,
  }),
  PaymentMode: valuesOf<PaymentMode>({ full: true, deposit: true, at_venue: true, free: true }),
  ResourceKind: valuesOf<ResourceKind>({ person: true, space: true, equipment: true }),
  LocationType: valuesOf<LocationType>({ business: true, customer: true, online: true }),
  QuestionKind: valuesOf<FormQuestionKind>({
    text: true,
    textarea: true,
    select: true,
    checkbox: true,
    number: true,
    phone: true,
    email: true,
  }),
  Role: valuesOf<MemberRole>({ owner: true, admin: true, staff: true }),
  BusinessStatus: valuesOf<BusinessStatus>({ draft: true, active: true, suspended: true }),
  Plan: valuesOf<Plan>({ free: true, pro: true, business: true }),
  BookingSource: valuesOf<BookingSource>({ public: true, dashboard: true, api: true, ai: true }),
  SiteThemeKey: valuesOf<SiteThemeKey>({
    clinical: true,
    calm: true,
    bold: true,
    playful: true,
    editorial: true,
    minimal: true,
  }),
  SiteSectionType: valuesOf<SiteSectionType>({
    hero: true,
    services: true,
    team: true,
    about: true,
    gallery: true,
    testimonials: true,
    faq: true,
    hours: true,
    cta: true,
    contact: true,
  }),
  GeneratedPattern: valuesOf<GeneratedPattern>({
    aurora: true,
    mesh: true,
    waves: true,
    grid: true,
    dots: true,
    rays: true,
  }),
  HeroVariant: valuesOf<HeroVariant>({ split: true, cover: true, minimal: true }),
  SiteVersionSource: valuesOf<SiteVersionSource>({
    owner: true,
    ai_generate: true,
    ai_edit: true,
    restore: true,
    template: true,
    seed: true,
  }),
};

describe("enums match backend/openapi.yaml", () => {
  it.each(Object.entries(ENUMS))("%s", (name, values) => {
    expect([...values].sort()).toEqual([...(contract.enumOf(name) as string[])].sort());
  });
});

describe("the contract checker", () => {
  it("names the schema and path of a property the spec lacks, and of a missing required one", () => {
    const { email: _email, ...withoutEmail } = customer;
    expect(contract.problems("Customer", { ...withoutEmail, nickname: "Ro" })).toEqual([
      "Customer: 'email' is required by the spec",
      "Customer: 'nickname' is not in the spec",
    ]);
    expect(
      contract.problems("Booking", { ...booking, customer: { ...booking.customer, vip: true } }),
    ).toEqual(["Booking/customer: 'vip' is not in the spec"]);
  });

  it("checks formats and types", () => {
    expect(contract.problems("Customer", { ...customer, id: "c1", bookingCount: 1.5 })).toEqual([
      'Customer/id: must match format "uuid"',
      "Customer/bookingCount: must be integer",
    ]);
  });

  it("closes the schemas inside a union: an unknown property in a section's content fails", () => {
    const [first, ...rest] = sitePlan.sections;
    const hero = must(first, "the hero section");
    const plan = {
      ...sitePlan,
      sections: [{ ...hero, content: { ...hero.content, subtitle: "x" } }, ...rest],
    };
    expect(contract.problems("SitePlan", plan).join("\n")).toContain("SitePlan/sections/0/content");
  });

  it("sees through allOf: a Business property is fine, an unknown one is not", () => {
    expect(contract.problems("Business", { ...business, extra: 1 })).toEqual([
      "Business: 'extra' is not in the spec",
    ]);
  });

  it("reports spec properties a fixture lacks, and non-null nullables", () => {
    const { internalNotes: _notes, ...withoutNotes } = booking;
    expect(contract.missingProperties("Booking", withoutNotes)).toEqual(["Booking.internalNotes"]);
    expect(contract.nonNullNullables("Customer", customer)).toEqual([
      "Customer.email",
      "Customer.phone",
      "Customer.notes",
      "Customer.groupId",
      "Customer.lastBookingAt",
    ]);
  });
});
