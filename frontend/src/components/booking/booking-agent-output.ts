/**
 * The output schemas of the booking flow's WebMCP tools (`booking-agent-tools.ts`), from the shapes in
 * `lib/booking/agent-views.ts`. Each is the result or `{ error }` (`toolOutput`), since a failure is returned rather
 * than thrown. The tools' tests check every result against these.
 */
import { toolOutput } from "@/lib/webmcp/model-context";

const string = { type: "string" } as const;
const nullableString = { type: ["string", "null"] } as const;
const strings = { type: "array", items: string } as const;

const price = {
  type: "object",
  properties: {
    duration: string,
    total: string,
    deal: nullableString,
    payNow: nullableString,
    payAtVenue: nullableString,
  },
  required: ["duration", "total", "deal", "payNow", "payAtVenue"],
} as const;

const named = (extra: Record<string, unknown>, required: string[]) =>
  ({
    type: "object",
    properties: { id: string, name: string, description: nullableString, ...extra },
    required: ["id", "name", ...required],
  }) as const;

export const bookingOptionsOutput = toolOutput(
  {
    business: {
      type: "object",
      properties: {
        name: string,
        description: nullableString,
        address: nullableString,
        timezone: string,
        phoneRequired: { type: "boolean" },
        nextAvailableOnly: { type: "boolean" },
      },
      required: ["name", "description", "address", "timezone", "phoneRequired", "nextAvailableOnly"],
    },
    customerGroups: { type: "array", items: named({}, []) },
    services: {
      type: "array",
      items: named(
        {
          category: nullableString,
          duration: string,
          price: string,
          payment: string,
          requiresApproval: { type: "boolean" },
          onlyForGroups: strings,
          options: {
            type: "array",
            items: named({ duration: string, price: string }, ["duration", "price"]),
          },
          addons: {
            type: "array",
            items: named({ extraTime: string, price: string }, ["extraTime", "price"]),
          },
          resourceChoice: {
            type: ["object", "null"],
            properties: { label: string, choices: { type: "array", items: named({}, []) } },
            required: ["label", "choices"],
          },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: string,
                label: string,
                help: nullableString,
                kind: string,
                choices: strings,
                required: { type: "boolean" },
                sensitive: { type: "boolean" },
              },
              required: ["id", "label", "kind", "required", "sensitive"],
            },
          },
        },
        [
          "duration",
          "price",
          "payment",
          "requiresApproval",
          "options",
          "addons",
          "resourceChoice",
          "questions",
        ],
      ),
    },
  },
  ["business", "customerGroups", "services"],
);

/** Free times, or (a business offering only its next available time) `nextAvailable`. */
export const availabilityOutput = toolOutput(
  {
    timezone: string,
    from: string,
    to: string,
    price,
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: string,
          times: strings,
          deals: {
            type: "array",
            items: {
              type: "object",
              properties: { time: string, deal: string, price: string },
              required: ["time", "price"],
            },
          },
        },
        required: ["date", "times"],
      },
    },
    notYetOpen: {
      type: "array",
      items: {
        type: "object",
        properties: { date: string, opensForBooking: nullableString },
        required: ["date", "opensForBooking"],
      },
    },
    nextAvailable: {
      type: ["object", "null"],
      properties: { date: string, time: string, deal: nullableString },
      required: ["date", "time", "deal"],
    },
    note: nullableString,
  },
  ["timezone", "price", "note"],
);

/** `flowStatus`: the step, what's chosen, the price and the details. */
export const flowStatusOutput = toolOutput(
  {
    step: string,
    next: string,
    notice: nullableString,
    selection: {
      type: "object",
      properties: {
        group: nullableString,
        service: nullableString,
        option: nullableString,
        addons: strings,
        resource: nullableString,
        date: nullableString,
        time: nullableString,
        timezone: string,
      },
      required: ["group", "service", "option", "addons", "resource", "date", "time", "timezone"],
    },
    price: { ...price, type: ["object", "null"] },
    payment: nullableString,
    details: {
      type: "object",
      properties: {
        name: nullableString,
        email: nullableString,
        phone: nullableString,
        answers: {
          type: "array",
          items: {
            type: "object",
            properties: { question: string, answer: string },
            required: ["question", "answer"],
          },
        },
        problems: strings,
      },
      required: ["name", "email", "phone", "answers", "problems"],
    },
  },
  ["step", "next", "notice", "selection", "price", "payment", "details"],
);

export const detailsOutput = toolOutput({ complete: { type: "boolean" }, problems: strings, next: string }, [
  "complete",
]);

export const confirmOutput = toolOutput(
  {
    booked: { type: "boolean" },
    status: { type: "string", enum: ["confirmed", "requested", "awaiting_payment"] },
    message: string,
    problems: strings,
  },
  ["booked", "status", "message"],
);
