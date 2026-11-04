import { describe, expect, it } from "vitest";
import { vocab } from "./vocabulary";

describe("vocab", () => {
  const physio = {
    resource: "Therapist",
    resources: "Therapists",
    customer: "patient",
    customers: "patients",
    booking: "Appointment",
    bookings: "Appointments",
  };
  it("title-cases on request and lower-cases stored capitals mid-sentence", () => {
    expect(vocab(physio, "bookings", { title: true })).toBe("Appointments");
    expect(vocab(physio, "bookings")).toBe("appointments");
    expect(vocab(physio, "customer")).toBe("patient");
  });
  it("keeps acronyms and falls back to defaults", () => {
    expect(vocab({ resources: "GPs" }, "resources")).toBe("GPs");
    expect(vocab(null, "resource", { count: 2 })).toBe("resources");
    expect(vocab(physio, "booking", { count: 1 })).toBe("appointment");
  });
});
