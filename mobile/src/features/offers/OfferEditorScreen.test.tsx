import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { business } from "@shared/api/__tests__/fixtures/business";
import { service } from "@shared/api/__tests__/fixtures/catalog";
import { offer, offerPreview } from "@shared/api/__tests__/fixtures/offers";
import type { Offer, OfferInput, OfferPreview, Service } from "@shared/api/types";
import { todayInTz } from "@shared/format";
import { json, mockApi, pending } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { OfferEditorScreen } from "./OfferEditorScreen";

const BASE = `/v1/businesses/${business.id}`;
const follow: Service = { ...service, id: "s_follow", name: "Follow-up", isPublic: false };
const retired: Service = { ...service, id: "s_old", name: "Retired", isActive: false };
const services = [service, follow, retired];

type Handler = (method: string, path: string, body: unknown) => unknown;

function api({ preview = offerPreview, handle }: { preview?: OfferPreview; handle?: Handler } = {}) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const previews: unknown[] = [];
  mockApi((method, path, body) => {
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === `${BASE}/offers`) return [offer];
    if (method === "GET" && path === `${BASE}/services`) return services;
    if (path === `${BASE}/offers/preview`) {
      previews.push(body);
      return preview;
    }
    if (method === "POST" || method === "PUT") {
      writes.push({ method, path, body });
      const { active, ...rest } = body as OfferInput;
      return { ...offer, ...rest, id: "o_new", status: active ? "active" : "paused" } satisfies Offer;
    }
    return undefined;
  });
  return { writes, previews };
}

function render(id: string) {
  return renderBusinessScreen(<OfferEditorScreen id={id} previewDelay={0} />, {
    role: "admin",
    path: `offers/${id}`,
  });
}

const pick = (testID: string, hours: number, minutes = 0) =>
  fireEvent(screen.getByTestId(`${testID}-picker`), "change", {
    nativeEvent: { timestamp: new Date(2001, 0, 1, hours, minutes).getTime() },
  });

describe("Offer editor", () => {
  beforeEach(() => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 800 });
  });

  it("creates a deal: services, discount, days, hours, last-minute, dates and limits", async () => {
    const back = jest.spyOn(router, "back").mockImplementation(() => undefined);
    const { writes } = api();
    render("new");
    const name = await screen.findByTestId("offer-name");

    // Active services only, all of them to start with; private ones say so.
    expect(screen.getByTestId(`offer-services-${service.id}`)).toBeChecked();
    expect(screen.getByTestId("offer-services-s_follow")).toHaveTextContent("Follow-up (private)");
    expect(screen.queryByTestId("offer-services-s_old")).toBeNull();

    // Nothing named, nothing chosen: the schema's messages.
    fireEvent.press(screen.getByTestId("offer-services-all"));
    await act(async () => fireEvent.press(screen.getByTestId("offer-save")));
    expect(await screen.findByText("Give the deal a name")).toBeOnTheScreen();
    expect(screen.getByText("Choose at least one service")).toBeOnTheScreen();

    fireEvent.changeText(name, "  Quiet evenings ");
    fireEvent.press(screen.getByTestId("offer-services-all"));
    fireEvent.press(screen.getByTestId("offer-services-s_follow"));

    // Fixed amount, and the percentage is remembered when switching back and forth.
    fireEvent.press(screen.getByRole("tab", { name: "Fixed amount" }));
    fireEvent.changeText(screen.getByTestId("offer-amount"), "12.50");
    fireEvent.press(screen.getByRole("tab", { name: "Percentage" }));
    expect(screen.getByTestId("offer-percent")).toHaveDisplayValue("20");
    fireEvent.press(screen.getByRole("tab", { name: "Fixed amount" }));
    expect(screen.getByTestId("offer-amount")).toHaveDisplayValue("12.50");

    // Weekdays, then not Fridays.
    expect(screen.getByText("No days picked: every day.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("offer-days-weekdays"));
    fireEvent.press(screen.getByTestId("offer-days-5"));
    expect(screen.getByTestId("offer-days-1")).toBeChecked();
    expect(screen.getByTestId("offer-days-5")).not.toBeChecked();

    // Two windows, the second moved, then removed again; the first kept.
    fireEvent.press(screen.getByTestId("offer-add-hours"));
    fireEvent.press(screen.getByTestId("offer-add-hours"));
    expect(screen.getByLabelText("Window 2 from: 17:00")).toBeOnTheScreen();
    pick("offer-window-1-end", 18);
    expect(screen.getByLabelText("Window 2 to: 18:00")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Remove window 2" }));
    expect(screen.queryByTestId("offer-window-1")).toBeNull();
    pick("offer-window-0-start", 12, 30);

    fireEvent(screen.getByTestId("offer-last-minute"), "valueChange", true);
    fireEvent.changeText(screen.getByTestId("offer-last-minute-hours"), "5");
    fireEvent.press(screen.getByTestId("offer-valid-from"));
    fireEvent.changeText(screen.getByTestId("offer-limit"), "100");
    fireEvent(screen.getByTestId("offer-active"), "valueChange", false);

    await act(async () => fireEvent.press(screen.getByTestId("offer-save")));
    expect(await screen.findByText("Quiet evenings created")).toBeOnTheScreen();
    expect(writes).toEqual([
      {
        method: "POST",
        path: `${BASE}/offers`,
        body: {
          name: "Quiet evenings",
          description: null,
          serviceIds: [service.id],
          discount: { type: "fixed", amountCents: 1250 },
          schedule: {
            daysOfWeek: [1, 2, 3, 4],
            timeWindows: [{ start: "12:30", end: "17:00" }],
            lastMinuteHours: 5,
          },
          validFrom: todayInTz(business.timezone),
          validUntil: null,
          maxRedemptions: 100,
          active: false,
        },
      },
    ]);
    expect(back).toHaveBeenCalled();
  });

  it("edits a deal, with Save waiting for a change", async () => {
    jest.spyOn(router, "back").mockImplementation(() => undefined);
    const { writes } = api();
    render(offer.id);
    expect(await screen.findByTestId("offer-name")).toHaveDisplayValue("Quiet Tuesdays");
    expect(screen.getByTestId("offer-save")).toBeDisabled();
    expect(screen.getByTestId("offer-days-2")).toBeChecked();
    expect(screen.getByTestId("offer-last-minute-hours")).toHaveDisplayValue("24");
    expect(screen.getByTestId("offer-limit")).toHaveDisplayValue("50");

    fireEvent.press(screen.getByRole("button", { name: "Clear Ends" }));
    fireEvent.press(screen.getByTestId("offer-days-every-day"));
    await act(async () => fireEvent.press(screen.getByTestId("offer-save")));
    expect(await screen.findByText("Quiet Tuesdays saved")).toBeOnTheScreen();
    expect(writes[0]).toMatchObject({
      method: "PUT",
      path: `${BASE}/offers/${offer.id}`,
      body: { validUntil: null, schedule: { daysOfWeek: [] } },
    });
  });

  it("puts the server's errors on the fields", async () => {
    api({
      handle: (method) =>
        method === "PUT"
          ? json(
              {
                error: {
                  code: "VALIDATION_FAILED",
                  message: "Check the deal",
                  fields: {
                    "schedule.timeWindows[0].end": "Ends too late",
                    "schedule.daysOfWeek[0]": "Bad day",
                  },
                },
              },
              422,
            )
          : undefined,
    });
    render(offer.id);
    fireEvent.changeText(await screen.findByTestId("offer-name"), "Quiet");
    await act(async () => fireEvent.press(screen.getByTestId("offer-save")));
    expect(await screen.findByText("Ends too late")).toBeOnTheScreen();
    expect(screen.getByText("Bad day")).toBeOnTheScreen();
  });

  it("previews the times a valid draft would discount", async () => {
    const many: OfferPreview = {
      ...offerPreview,
      affectedSlots: 20,
      days: [
        {
          date: offerPreview.days[0]!.date,
          slots: Array.from({ length: 8 }, (_, i) => ({
            ...offerPreview.days[0]!.slots[0]!,
            start: `2026-10-06T${String(9 + i).padStart(2, "0")}:00:00+01:00`,
          })),
        },
      ],
    };
    const { previews } = api({ preview: many });
    render(offer.id);
    const summary = await screen.findByTestId("offer-preview-summary");
    expect(summary).toHaveTextContent("20 of 120 times in the next 7 days");
    expect(screen.getAllByLabelText("was €70, now €56")).toHaveLength(6);
    expect(screen.getByText("+ 2 more")).toBeOnTheScreen();
    expect(screen.getByText("Showing the first 8 times.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Share of times discounted")).toHaveProp("accessibilityValue", {
      min: 0,
      max: 100,
      now: 17,
      text: "17%, 20 of 120 times in the next 7 days",
    });
    // The name doesn't change which times match.
    expect(previews[0]).toMatchObject({ offer: { name: "Preview", serviceIds: offer.serviceIds }, days: 7 });

    // An invalid draft has nothing to preview.
    fireEvent.changeText(screen.getByTestId("offer-percent"), "");
    expect(await screen.findByLabelText(/^Nothing to preview yet/)).toBeOnTheScreen();
  });

  it("says when nothing is bookable or nothing matches", async () => {
    api({ preview: { ...offerPreview, totalSlots: 0, affectedSlots: 0, days: [] } });
    const first = render(offer.id);
    expect(await screen.findByLabelText(/^Nothing bookable this week/)).toBeOnTheScreen();
    first.unmount();

    api({ preview: { ...offerPreview, affectedSlots: 0, days: [] } });
    render(offer.id);
    expect(await screen.findByLabelText(/^No times match/)).toBeOnTheScreen();
  });

  it("shows the preview loading, and failing with a retry", async () => {
    let mode: "pending" | "fail" | "ok" = "pending";
    api({
      handle: (_m, path) => {
        if (!path.endsWith("/offers/preview")) return undefined;
        if (mode === "pending") return pending();
        if (mode === "fail")
          return json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500);
        return undefined;
      },
    });
    const first = render(offer.id);
    expect(await screen.findByLabelText("Loading affected times")).toBeOnTheScreen();
    first.unmount();

    mode = "fail";
    render(offer.id);
    const preview = await screen.findByTestId("offer-preview");
    await waitFor(() => expect(within(preview).getByTestId("error-state")).toBeOnTheScreen());
    mode = "ok";
    await act(async () => fireEvent.press(within(preview).getByRole("button", { name: "Try again" })));
    expect(await screen.findByTestId("offer-preview-summary")).toBeOnTheScreen();
  });

  it("says when the deal is gone", async () => {
    const back = jest.spyOn(router, "back").mockImplementation(() => undefined);
    api();
    render("o_missing");
    expect(await screen.findByText("This offer is gone")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Back to offers" }));
    expect(back).toHaveBeenCalled();
  });

  it("shows skeletons while loading, and an error with a retry", async () => {
    let mode: "pending" | "fail" | "ok" = "pending";
    api({
      handle: (_m, path) => {
        if (path !== `${BASE}/services`) return undefined;
        if (mode === "pending") return pending();
        if (mode === "fail")
          return json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500);
        return undefined;
      },
    });
    const first = render("new");
    expect(await screen.findByLabelText("Loading the offer")).toBeOnTheScreen();
    first.unmount();

    mode = "fail";
    render(offer.id);
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    mode = "ok";
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Try again" })));
    expect(await screen.findByTestId("offer-name")).toBeOnTheScreen();
  });
});
