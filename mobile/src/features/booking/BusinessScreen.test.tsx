import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { publicOffer } from "@shared/api/__tests__/fixtures/offers";
import { apiError, mockApi } from "~/test/api-mock";
import { business, freeService, paidService } from "~/test/customer";
import { renderScreen } from "~/test/render";
import { BookScreen } from "./BookScreen";
import { BusinessScreen } from "./BusinessScreen";
import { policyLines, strictestMode, websiteHost } from "./business-page";

jest.mock("expo-router", () => {
  const actual = jest.requireActual<typeof import("expo-router")>("expo-router");
  return { ...actual, useLocalSearchParams: jest.fn(() => ({ slug: "lumen-physio" })) };
});

const BASE = `/v1/public/businesses/${business.slug}`;

function setup(over: { business?: unknown; services?: unknown } = {}) {
  return mockApi((_method, path) => {
    if (path === BASE) return over.business ?? business;
    if (path === `${BASE}/services`) return over.services ?? [freeService, paidService];
    if (path === `${BASE}/offers`) return [{ ...publicOffer, serviceIds: [paidService.id] }];
    return undefined;
  });
}

describe("BusinessScreen", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  it("shows the business, its deals, services with options and extras, policies and contact", async () => {
    setup();
    renderScreen(<BusinessScreen />);
    expect(await screen.findByRole("header", { name: "Lumen Physiotherapy" })).toBeOnTheScreen();
    expect(screen.getByText("Physiotherapy for sports injuries.")).toBeOnTheScreen();
    expect(await screen.findByTestId(`service-${freeService.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`service-${paidService.id}`)).toHaveAccessibleName(
      /^Initial assessment, €95, 1 h 30 min, €20 deposit or pay at venue/,
    );
    expect(screen.getByTestId(`service-extras-${paidService.id}`)).toHaveTextContent(/\+ Taping/);
    expect(await screen.findByText("Current deal")).toBeOnTheScreen();
    expect(screen.getByTestId("business-policies")).toHaveTextContent(
      /Cancel up to 24 hours before for a full refund\./,
    );
    fireEvent.press(screen.getByRole("button", { name: /^\+353 1 555 0101/ }));
    expect(Linking.openURL).toHaveBeenLastCalledWith("tel:+35315550101");
    fireEvent.press(screen.getByRole("button", { name: /Lantern Quay.*Directions/ }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(expect.stringContaining("Lantern%20Quay"));
  });

  it("opens the booking flow, with a service or from Book", async () => {
    setup();
    const app = renderScreen(<BusinessScreen />, { routes: { "[slug]/book": () => <BookScreen /> } });
    fireEvent.press(await screen.findByTestId(`service-${freeService.id}`));
    expect(app.getPathname()).toBe("/lumen-physio/book");
    expect(app.getSearchParams()).toMatchObject({ service: freeService.id });
  });

  it("says when the business doesn't exist", async () => {
    mockApi(() => apiError(404, "NOT_FOUND", "Business not found."));
    renderScreen(<BusinessScreen />);
    expect(await screen.findByText("This booking page doesn't exist")).toBeOnTheScreen();
  });

  it("says when there's nothing to book online", async () => {
    setup({ services: [] });
    renderScreen(<BusinessScreen />);
    expect(await screen.findByText("Nothing to book online just yet")).toBeOnTheScreen();
  });

  it("shows the API's error for the services with a retry", async () => {
    mockApi((_m, path) =>
      path === BASE ? business : apiError(500, "INTERNAL_SERVER_ERROR", "Services broke."),
    );
    renderScreen(<BusinessScreen />);
    expect(await screen.findByText("We couldn't load the services")).toBeOnTheScreen();
  });
});

describe("BookScreen", () => {
  it("loads the business and services together, then the flow in the business's colour", async () => {
    setup();
    renderScreen(<BookScreen />);
    expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
    expect(await screen.findByTestId("booking-flow")).toBeOnTheScreen();
  });

  it("says when the services can't be loaded", async () => {
    mockApi((_m, path) => (path === BASE ? business : apiError(500, "INTERNAL_SERVER_ERROR", "Nope.")));
    renderScreen(<BookScreen />);
    expect(await screen.findByText("We couldn't load the services")).toBeOnTheScreen();
  });

  it("says when the business doesn't exist", async () => {
    mockApi(() => apiError(404, "NOT_FOUND", "Business not found."));
    renderScreen(<BookScreen />);
    expect(await screen.findByText("This booking page doesn't exist")).toBeOnTheScreen();
  });
});

describe("business page wording", () => {
  it("words the policies from the business and its services", () => {
    expect(strictestMode([freeService])).toBe("free");
    expect(strictestMode([freeService, { ...freeService, paymentMode: "at_venue", priceCents: 100 }])).toBe(
      "at_venue",
    );
    expect(strictestMode([paidService])).toBe("full");
    const lines = policyLines(
      {
        ...business,
        policies: { ...business.policies, nextAvailableOnly: true, allowCustomerReschedule: false },
      },
      [{ ...freeService, requiresApproval: true }],
    );
    expect(lines).toEqual([
      "Free cancellation up to 24 hours before.",
      "To move a booking, contact Lumen Physiotherapy.",
      "Book at least 1 h ahead.",
      "Book up to 60 days ahead.",
      "You're offered the next available time, one at a time.",
      "Some services are requests: Lumen Physiotherapy confirms each one.",
    ]);
    expect(websiteHost("https://lumen-physio.test/")).toBe("lumen-physio.test");
    expect(websiteHost(null)).toBeNull();
  });
});
