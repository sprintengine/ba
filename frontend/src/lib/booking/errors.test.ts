import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { bookingErrorAlert, classifyBookingError, isSlotUnavailable, mapBookingFieldErrors } from "./errors";

describe("booking errors", () => {
  it("classifies booking errors", () => {
    expect(classifyBookingError(new ApiError(409, "SLOT_UNAVAILABLE", "taken"))).toBe("slot_taken");
    expect(classifyBookingError(new ApiError(409, "CONFLICT", "taken"))).toBe("slot_taken");
    expect(classifyBookingError(new ApiError(409, "PLAN_LIMIT_REACHED", "limit"))).toBe("plan_limit");
    expect(classifyBookingError(new ApiError(429, "RATE_LIMITED", "slow"))).toBe("rate_limited");
    expect(classifyBookingError(new ApiError(409, "PAYMENTS_NOT_CONFIGURED", "no"))).toBe("payments");
    expect(classifyBookingError(new ApiError(422, "POLICY_VIOLATION", "no"))).toBe("policy");
    expect(classifyBookingError(new ApiError(400, "INVALID_REQUEST", "bad", { "customer.email": "x" }))).toBe(
      "fields",
    );
    expect(classifyBookingError(new ApiError(400, "INVALID_REQUEST", "bad"))).toBe("other");
    expect(classifyBookingError(new ApiError(0, "NETWORK_ERROR", "down"))).toBe("unavailable");
    expect(classifyBookingError(new Error("boom"))).toBe("other");
    expect(classifyBookingError(null)).toBe("other");
  });

  it("maps API field paths onto the details form", () => {
    expect(
      mapBookingFieldErrors({
        "customer.name": "Name",
        "customer.email": "Bad",
        "customer.phone": "Phone",
        customerNotes: "Notes",
        "answers.q1": "Required",
        optionId: "Choose an option",
        constructor: "odd",
      }),
    ).toEqual({
      form: { name: "Name", email: "Bad", phone: "Phone", notes: "Notes", "answers.q1": "Required" },
      other: { optionId: "Choose an option", constructor: "odd" },
    });
  });

  it("recognises a taken slot", () => {
    expect(isSlotUnavailable(new ApiError(409, "SLOT_UNAVAILABLE", "taken"))).toBe(true);
    expect(isSlotUnavailable(new ApiError(409, "CONFLICT", "taken"))).toBe(false);
    expect(isSlotUnavailable(new Error("SLOT_UNAVAILABLE"))).toBe(false);
  });
});

describe("bookingErrorAlert", () => {
  const ctx = { businessName: "Lumen", contact: "+353 1 555 0101", bookingsNoun: "appointments" };

  it("points to the business when it can't take the booking online", () => {
    expect(bookingErrorAlert(new ApiError(409, "PLAN_LIMIT_REACHED", "limit"), ctx)).toEqual({
      tone: "danger",
      title: "Lumen can't take more online appointments right now",
      body: "Please get in touch directly: +353 1 555 0101.",
    });
    expect(
      bookingErrorAlert(new ApiError(409, "PLAN_LIMIT_REACHED", "limit"), { ...ctx, contact: "" }).body,
    ).toBe("Please get in touch with them directly.");
    expect(bookingErrorAlert(new ApiError(409, "PAYMENTS_NOT_CONFIGURED", "no"), ctx).body).toBe(
      "Lumen can't take payments online at the moment. Please contact them: +353 1 555 0101.",
    );
    expect(
      bookingErrorAlert(new ApiError(409, "PAYMENTS_NOT_CONFIGURED", "no"), { ...ctx, contact: "" }).body,
    ).toBe("Lumen can't take payments online at the moment. Please contact them directly.");
  });

  it("points to paying at the venue when online payment isn't available and the customer may choose it", () => {
    expect(
      bookingErrorAlert(new ApiError(409, "PAYMENTS_NOT_CONFIGURED", "no"), {
        ...ctx,
        payAtVenueOffered: true,
      }).body,
    ).toBe(
      "Lumen can't take payments online at the moment. Choose “Pay at the venue” under Payment to book now and pay at your appointment.",
    );
  });

  it("says the price changed, with the server's new price, and that nothing was booked", () => {
    const changed = new ApiError(
      409,
      "PRICE_CHANGED",
      "The price for this time has changed to €30. Check it and book again.",
    );
    expect(classifyBookingError(changed)).toBe("price_changed");
    expect(isSlotUnavailable(changed)).toBe(false);
    expect(bookingErrorAlert(changed, ctx)).toEqual({
      tone: "warning",
      title: "The price has changed",
      body: "The price for this time has changed to €30. Check it and book again. Nothing has been booked yet.",
    });
  });

  it("asks to wait or retry for transient problems", () => {
    expect(bookingErrorAlert(new ApiError(429, "RATE_LIMITED", "slow"), ctx)).toMatchObject({
      tone: "warning",
      title: "Too many attempts",
    });
    expect(bookingErrorAlert(new ApiError(0, "NETWORK_ERROR", "down"), ctx)).toMatchObject({
      tone: "warning",
      title: "We couldn't reach the booking system",
    });
  });

  it("shows a field error from an earlier step, else the server's message", () => {
    const fields = new ApiError(400, "INVALID_REQUEST", "Invalid.", { optionId: "Choose an option" });
    expect(bookingErrorAlert(fields, ctx)).toEqual({
      tone: "danger",
      title: "Something in your selection needs another look",
      body: "Choose an option",
    });
    expect(bookingErrorAlert(new ApiError(422, "POLICY_VIOLATION", "Too late to book."), ctx)).toEqual({
      tone: "danger",
      title: "We couldn't complete your booking",
      body: "Too late to book.",
    });
  });
});
