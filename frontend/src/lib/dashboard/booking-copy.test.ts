import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/vocabulary";
import {
  amountDue,
  auditActionLabel,
  auditActorLabel,
  auditDetail,
  refundableOnline,
  refundPreview,
} from "./booking-copy";

const physio = {
  resource: "therapist",
  resources: "therapists",
  customer: "patient",
  customers: "patients",
  booking: "appointment",
  bookings: "appointments",
};
const v = (k: "booking" | "customer" | "resource", o?: { title?: boolean }) => vocab(physio, k, o);

describe("booking copy", () => {
  it("labels audit actions in the business vocabulary", () => {
    expect(auditActionLabel("booking.created", v)).toBe("Appointment created");
    expect(auditActionLabel("booking.cancelled", v)).toBe("Cancelled");
    expect(auditActionLabel("booking.some_new_thing", v)).toBe("Some new thing");
  });

  it("labels every known audit action", () => {
    const labels = Object.fromEntries(
      [
        "booking.seeded",
        "booking.updated",
        "booking.approved",
        "booking.declined",
        "booking.rescheduled",
        "booking.completed",
        "booking.no_show",
        "booking.status_changed",
        "booking.expired",
        "booking.confirmed",
        "payment.succeeded",
        "payment.failed",
        "payment.refunded",
        "payment.refunded_late",
      ].map((action) => [action, auditActionLabel(action, v)]),
    );
    expect(labels).toEqual({
      "booking.seeded": "Appointment created",
      "booking.updated": "Details updated",
      "booking.approved": "Approved",
      "booking.declined": "Declined",
      "booking.rescheduled": "Rescheduled",
      "booking.completed": "Marked completed",
      "booking.no_show": "Marked no-show",
      "booking.status_changed": "Status changed",
      "booking.expired": "Hold expired",
      "booking.confirmed": "Confirmed",
      "payment.succeeded": "Payment received",
      "payment.failed": "Payment failed",
      "payment.refunded": "Refund issued",
      "payment.refunded_late": "Late payment refunded",
    });
    expect(auditActionLabel("weird.", v)).toBe("weird.");
  });

  it("names actors", () => {
    expect(auditActorLabel({ actorType: "owner", actorName: null }, v)).toBe("Owner");
    expect(auditActorLabel({ actorType: "customer", actorName: null }, v)).toBe("Patient");
    expect(auditActorLabel({ actorType: "ai", actorName: null }, v)).toBe("AI assistant");
    expect(auditActorLabel({ actorType: "robot", actorName: null }, v)).toBe("Someone");
    expect(auditActorLabel({ actorType: "member", actorName: "Casey Lane" }, v)).toBe("Casey Lane");
    expect(auditActorLabel({ actorType: "guest", actorName: null }, v)).toBe("Patient");
    expect(auditActorLabel({ actorType: "system", actorName: null }, v)).toBe("Automatic");
  });

  it("summarises audit details", () => {
    expect(auditDetail({ summary: { reason: "Ill", refundCents: 4500 } }, "EUR", (x) => x)).toBe(
      "“Ill” · €45 refunded",
    );
    expect(auditDetail({ summary: {} }, "EUR", (x) => x)).toBeNull();
    // Money in is an amount, not a refund.
    expect(
      auditDetail({ action: "payment.received_in_person", summary: { amountCents: 4500 } }, "EUR", (x) => x),
    ).toBe("€45");
    expect(
      auditDetail({ action: "payment.succeeded", summary: { amountCents: 1500 } }, "EUR", (x) => x),
    ).toBe("€15");
    expect(auditDetail({ action: "payment.refunded", summary: { amountCents: 1500 } }, "EUR", (x) => x)).toBe(
      "€15 refunded",
    );
    expect(auditActionLabel("payment.received_in_person", v)).toBe("Paid in person");
    expect(auditDetail({ summary: { to: "riley@example.test" } }, "EUR", (x) => x)).toBe(
      "to riley@example.test",
    );
    expect(auditActionLabel("booking.payment_link_sent", v)).toBe("Payment link sent");
    expect(
      auditDetail(
        { summary: { newStart: "2099-10-01T10:00:00Z", amountCents: 0, reason: " " } },
        "EUR",
        (x) => `@${x}`,
      ),
    ).toBe("to @2099-10-01T10:00:00Z");
    expect(auditDetail({ summary: { to: "somewhere" } }, "EUR", (x) => x)).toBeNull();
  });

  it("previews refunds for each choice", () => {
    const b = {
      amountPaidCents: 6000,
      amountPaidInPersonCents: 0,
      amountRefundedCents: 1000,
      currency: "EUR",
    };
    expect(refundPreview(b, "policy")).toMatchObject({ amountCents: 5000 });
    expect(refundPreview(b, "policy").text).toMatch(/€50/);
    expect(refundPreview(b, "full").amountCents).toBe(5000);
    expect(refundPreview(b, "none")).toMatchObject({ amountCents: 0 });
    expect(refundPreview({ ...b, amountPaidCents: 0, amountRefundedCents: 0 }, "full").text).toMatch(
      /Nothing has been paid/,
    );
    expect(refundPreview(b, "policy").text).not.toMatch(/in person/);
  });

  it("refunds only what was paid online and says where in-person money goes", () => {
    // A €15 deposit online, the €45 balance paid at the venue.
    const b = {
      amountPaidCents: 6000,
      amountPaidInPersonCents: 4500,
      amountRefundedCents: 0,
      currency: "EUR",
    };
    expect(refundableOnline(b)).toBe(1500);
    expect(refundableOnline({ ...b, amountRefundedCents: 1500 })).toBe(0);
    expect(refundPreview(b, "policy")).toEqual({
      amountCents: 1500,
      text: "Your policy refunds cancellations made by the business in full: €15 goes back to the original payment method. €45 paid in person isn't refunded online — return it at the venue.",
    });
    expect(refundPreview(b, "full")).toMatchObject({ amountCents: 1500 });
    expect(refundPreview(b, "none").text).toBe("No refund. The €15 already paid online is kept.");

    // Paid in full at the venue: nothing to refund online.
    const atVenue = { ...b, amountPaidCents: 4000, amountPaidInPersonCents: 4000 };
    expect(refundableOnline(atVenue)).toBe(0);
    expect(refundPreview(atVenue, "full")).toEqual({
      amountCents: 0,
      text: "Nothing has been paid online, so there's nothing to refund. €40 paid in person isn't refunded online — return it at the venue.",
    });
  });

  it("computes the amount still due", () => {
    expect(
      amountDue({ priceCents: 5000, amountPaidCents: 1000, amountRefundedCents: 0, status: "confirmed" }),
    ).toBe(4000);
    expect(
      amountDue({ priceCents: 5000, amountPaidCents: 0, amountRefundedCents: 0, status: "cancelled" }),
    ).toBe(0);
  });
});
