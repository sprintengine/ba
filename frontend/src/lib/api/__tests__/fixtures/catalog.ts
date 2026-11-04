/** Resource, question and service fixtures: complete (`x`) and with every nullable property null (`xSparse`). */
import type { CustomerGroup, FormQuestion, PublicService, Resource, Service } from "@/lib/api/types";
import { ids } from "./ids";

export const resource = {
  id: ids.resource,
  kind: "person",
  name: "Alex Morgan",
  description: "Senior physiotherapist",
  color: "#0e7c70",
  capacity: 1,
  memberId: ids.member,
  isActive: true,
  sortOrder: 0,
} satisfies Resource;

export const resourceSparse = { ...resource, description: null, memberId: null } satisfies Resource;

export const customerGroup = {
  id: ids.group,
  name: "Members",
  description: "Club members get evening slots.",
  restricted: false,
  sortOrder: 0,
  isActive: true,
} satisfies CustomerGroup;

export const formQuestion = {
  id: ids.question,
  serviceId: ids.service,
  label: "Which knee?",
  helpText: "So we can prepare.",
  kind: "select",
  options: ["Left", "Right", "Both"],
  required: true,
  sensitive: false,
  sortOrder: 0,
  isActive: true,
} satisfies FormQuestion;

/** A question asked for every service. */
export const formQuestionSparse = { ...formQuestion, serviceId: null, helpText: null } satisfies FormQuestion;

const option = {
  id: ids.option,
  name: "Extended",
  description: "90 minutes",
  durationMinutes: 90,
  priceCents: 9500,
  sortOrder: 0,
} satisfies Service["options"][number];

const addon = {
  id: ids.addon,
  name: "Taping",
  description: "Kinesiology tape",
  extraMinutes: 10,
  priceCents: 1000,
  sortOrder: 0,
} satisfies Service["addons"][number];

const publicQuestion = {
  id: ids.question,
  label: "Which knee?",
  helpText: "So we can prepare.",
  kind: "select",
  options: ["Left", "Right", "Both"],
  required: true,
  sensitive: false,
  sortOrder: 0,
} satisfies PublicService["questions"][number];

export const service = {
  id: ids.service,
  name: "Initial assessment",
  description: "A full assessment and your first treatment.",
  category: "Physiotherapy",
  color: "#0e7c70",
  durationMinutes: 60,
  bufferBeforeMinutes: 5,
  bufferAfterMinutes: 10,
  slotIntervalMinutes: 30,
  minNoticeMinutes: 120,
  maxAdvanceDays: 30,
  capacity: 1,
  priceCents: 7000,
  paymentMode: "deposit",
  depositCents: 2000,
  allowPayAtVenue: true,
  requiresApproval: false,
  locationType: "business",
  allowedGroupIds: [ids.group],
  isPublic: true,
  isActive: true,
  sortOrder: 0,
  options: [option],
  addons: [addon],
  requirements: [
    {
      id: ids.requirement,
      label: "Therapist",
      quantity: 1,
      customerSelectable: true,
      resourceIds: [ids.resource, ids.resource2],
      sortOrder: 0,
    },
  ],
} satisfies Service;

export const serviceSparse = {
  ...service,
  description: null,
  category: null,
  slotIntervalMinutes: null,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  paymentMode: "at_venue",
  depositCents: null,
  allowPayAtVenue: false,
  options: [{ ...option, description: null }],
  addons: [{ ...addon, description: null }],
} satisfies Service;

const { requirements: _requirements, isPublic: _isPublic, isActive: _isActive, ...publicFields } = service;

export const publicService = {
  ...publicFields,
  selectableRequirement: {
    id: ids.requirement,
    label: "Therapist",
    resources: [
      { id: ids.resource, name: "Alex Morgan", description: "Senior physiotherapist", kind: "person" },
      { id: ids.resource2, name: "Jordan Casey", description: null, kind: "person" },
    ],
  },
  questions: [publicQuestion],
} satisfies PublicService;

export const publicServiceSparse = {
  ...publicService,
  description: null,
  category: null,
  slotIntervalMinutes: null,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  depositCents: null,
  options: [{ ...option, description: null }],
  addons: [{ ...addon, description: null }],
  selectableRequirement: null,
  questions: [{ ...publicQuestion, helpText: null }],
} satisfies PublicService;
