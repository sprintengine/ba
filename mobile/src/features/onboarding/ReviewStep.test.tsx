import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Alert, type AlertButton } from "react-native";
import { business as businessFixture, me } from "@shared/api/__tests__/fixtures/business";
import type { BusinessSetup } from "@shared/api/types";
import type { SetupAction } from "@shared/onboarding/actions";
import { createDraft } from "@shared/onboarding/draft";
import { fixture } from "@shared/onboarding/__tests__/fixture";
import { setupReducer } from "@shared/onboarding/setup-reducer";
import type { SetupDraft } from "@shared/onboarding/types";
import { calls, json, mockApi } from "~/test/api-mock";
import { renderWithProviders as render, testQueryClient } from "~/test/render";
import { ReviewStep } from "./ReviewStep";
import type { DraftOrigin } from "./wizard";

/** Holds the draft the way the wizard does, and exposes it to assertions. */
const current: { draft: SetupDraft | null } = { draft: null };
const latest = () => current.draft!;
function Harness({
  initial,
  origin = { kind: "ai" },
  onCreated = jest.fn(),
  onStartOver = jest.fn(),
}: {
  initial: SetupDraft;
  origin?: DraftOrigin;
  onCreated?: jest.Mock;
  onStartOver?: jest.Mock;
}) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    current.draft = draft;
  }, [draft]);
  return (
    <ReviewStep
      draft={draft}
      origin={origin}
      dispatch={(action: SetupAction) => setDraft((d) => setupReducer(d, action))}
      onCreated={onCreated}
      onStartOver={onStartOver}
    />
  );
}

type Options = { taken?: () => boolean; create?: (body: BusinessSetup) => unknown };

function api({ taken = () => false, create }: Options = {}) {
  return mockApi((method, path, body) => {
    if (method === "GET" && path === "/v1/me") return me;
    if (method === "GET" && path === "/v1/public/templates") return [];
    if (method === "GET" && path === "/v1/businesses/slug-available")
      return taken()
        ? { available: false, suggestion: "gleam-car-wash-2" }
        : { available: true, suggestion: null };
    if (method === "POST" && path === "/v1/businesses") {
      const setup = body as BusinessSetup;
      return create?.(setup) ?? { ...businessFixture, id: "b_new", slug: setup.slug, name: setup.name };
    }
    return undefined;
  });
}

function setupWith(patch: (s: BusinessSetup) => BusinessSetup = (s) => s) {
  return createDraft(patch(fixture()));
}

function answerAlert(label: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === label)?.onPress?.();
  });
}

const at = (h: number, m = 0) => ({ nativeEvent: { timestamp: new Date(2001, 0, 1, h, m).getTime() } });

/** A client whose finished mutations leave no 5-minute garbage-collection timer behind. */
function renderWithProviders(ui: Parameters<typeof render>[0]) {
  const client = testQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { retry: false, gcTime: Infinity },
  });
  return render(ui, { client });
}

async function ready() {
  await waitFor(() => expect(screen.getByText("Ready to create")).toBeOnTheScreen());
}

describe("ReviewStep", () => {
  // Let the debounced address check settle before the screen is unmounted.
  afterEach(() => act(() => new Promise((resolve) => setTimeout(resolve, 400))));

  it("blocks Create while something needs fixing and opens it", async () => {
    const mock = api();
    renderWithProviders(
      <Harness
        initial={setupWith((s) => ({
          ...s,
          services: s.services.map((x, i) => (i === 0 ? { ...x, name: " " } : x)),
        }))}
      />,
    );
    expect(screen.getByText("1 thing to fix")).toBeOnTheScreen();
    expect(screen.getByTestId("onboarding-problems")).toHaveTextContent(
      /Service 1 · Name: Give this service a name/,
    );
    expect(screen.getByText("Unnamed service")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("onboarding-create"));
    const sheet = await screen.findByTestId("onboarding-service-sheet");
    expect(calls(mock)).not.toContain("POST /v1/businesses");
    expect(within(sheet).getByText("Give this service a name")).toBeOnTheScreen();

    fireEvent.changeText(within(sheet).getByTestId("onboarding-service-name"), "Exterior wash");
    fireEvent.press(within(sheet).getByTestId("onboarding-service-done"));
    await ready();
    expect(screen.queryByTestId("onboarding-problems")).toBeNull();
  });

  it("creates the business from the edited draft", async () => {
    const onCreated = jest.fn();
    const mock = api();
    renderWithProviders(<Harness initial={setupWith()} onCreated={onCreated} />);
    await ready();
    fireEvent.press(screen.getByTestId("onboarding-create"));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ id: "b_new", slug: "gleam-car-wash", name: "Gleam Car Wash" }),
    );
    expect(calls(mock)).toContain("POST /v1/businesses");
  });

  it("flags a taken address and uses the suggestion", async () => {
    let taken = true;
    api({ taken: () => taken });
    renderWithProviders(<Harness initial={setupWith()} />);
    expect(await screen.findByText("That address is already taken")).toBeOnTheScreen();
    expect(screen.getByText("1 thing to fix")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("onboarding-problem-count"));
    const sheet = await screen.findByTestId("onboarding-business-sheet");
    expect(within(sheet).getByTestId("onboarding-slug-taken")).toBeOnTheScreen();
    taken = false;
    fireEvent.press(within(sheet).getByTestId("onboarding-slug-suggestion"));
    expect(latest().setup.slug).toBe("gleam-car-wash-2");
    expect(await within(sheet).findByTestId("onboarding-slug-available")).toBeOnTheScreen();
    // The owner chose an address: "Match business name" puts the derived one back.
    fireEvent.press(within(sheet).getByTestId("onboarding-slug-reset"));
    expect(latest().setup.slug).toBe("gleam-car-wash");
  });

  it("opens the address when the create finds it was just taken", async () => {
    api({
      create: () =>
        json(
          { error: { code: "SLUG_TAKEN", message: "Taken", fields: { slug: "Someone just took it" } } },
          409,
        ),
    });
    renderWithProviders(<Harness initial={setupWith()} />);
    await ready();
    fireEvent.press(screen.getByTestId("onboarding-create"));
    const sheet = await screen.findByTestId("onboarding-business-sheet");
    expect(within(sheet).getByText("Someone just took it")).toBeOnTheScreen();
  });

  it("shows server field errors until the next edit", async () => {
    api({
      create: () =>
        json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Fix the services",
              fields: { "services[1].priceCents": "Too high" },
            },
          },
          400,
        ),
    });
    renderWithProviders(<Harness initial={setupWith()} />);
    await ready();
    fireEvent.press(screen.getByTestId("onboarding-create"));
    expect(await screen.findByTestId("onboarding-create-error")).toHaveTextContent("Fix the services");
    expect(screen.getByTestId("onboarding-problems")).toHaveTextContent(/Full valet · Price: Too high/);

    fireEvent.press(screen.getByTestId("onboarding-fix-services[1].priceCents"));
    const sheet = await screen.findByTestId("onboarding-service-sheet");
    fireEvent.changeText(within(sheet).getByTestId("onboarding-service-price"), "70");
    expect(latest().setup.services[1]?.priceCents).toBe(7000);
    expect(screen.queryByTestId("onboarding-create-error")).toBeNull();
  });

  it("edits the business: name, address, description and currency", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} />);
    fireEvent.press(screen.getByTestId("onboarding-review-name"));
    const sheet = await screen.findByTestId("onboarding-business-sheet");
    fireEvent.changeText(within(sheet).getByTestId("onboarding-business-name"), "Suds & Co");
    expect(latest().setup).toMatchObject({ name: "Suds & Co", slug: "suds-and-co" });
    fireEvent.changeText(within(sheet).getByTestId("onboarding-business-slug"), "Suds Galway");
    expect(latest().setup.slug).toBe("suds-galway");
    expect(latest().slugEdited).toBe(true);
    fireEvent.changeText(within(sheet).getByTestId("onboarding-business-description"), "Hand wash.");
    expect(latest().setup.description).toBe("Hand wash.");

    fireEvent.press(within(sheet).getByTestId("onboarding-business-currency"));
    fireEvent.press(screen.getByRole("button", { name: "GBP · British pound" }));
    expect(latest().setup.currency).toBe("GBP");

    fireEvent.press(within(sheet).getByTestId("onboarding-business-done"));
    await waitFor(() => expect(screen.queryByTestId("onboarding-business-sheet")).toBeNull());
    expect(screen.getByText(/Europe\/Dublin · GBP|Europe\/Dublin · GBP/)).toBeOnTheScreen();
  });

  it("lists a currency the picker doesn't have and flags an empty address", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith((s) => ({ ...s, currency: "JPY" }))} />);
    fireEvent.press(screen.getByTestId("onboarding-review-region"));
    const sheet = await screen.findByTestId("onboarding-business-sheet");
    expect(within(sheet).getByRole("button", { name: "Currency: JPY · JPY" })).toBeOnTheScreen();
    fireEvent.changeText(within(sheet).getByTestId("onboarding-business-slug"), "");
    expect(within(sheet).getByText("Choose a web address")).toBeOnTheScreen();
  });

  it("edits a service: length, payment and deposit", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} />);
    expect(screen.getByTestId("onboarding-service-0")).toHaveTextContent(/30 min · €15 · Paid online/);
    fireEvent.press(screen.getByTestId("onboarding-service-0"));
    const sheet = await screen.findByTestId("onboarding-service-sheet");
    fireEvent.changeText(within(sheet).getByTestId("onboarding-service-duration"), "45");
    expect(latest().setup.services[0]?.durationMinutes).toBe(45);

    fireEvent.press(within(sheet).getByTestId("onboarding-service-payment"));
    fireEvent.press(screen.getByRole("button", { name: /^Deposit online/ }));
    expect(latest().setup.services[0]).toMatchObject({ paymentMode: "deposit", depositCents: 400 });
    fireEvent.changeText(within(sheet).getByTestId("onboarding-service-deposit"), "20");
    expect(within(sheet).getByText("The deposit can't be more than the price")).toBeOnTheScreen();
    fireEvent.changeText(within(sheet).getByTestId("onboarding-service-deposit"), "5");
    expect(within(sheet).queryByText("The deposit can't be more than the price")).toBeNull();

    fireEvent.press(within(sheet).getByTestId("onboarding-service-payment"));
    fireEvent.press(screen.getByRole("button", { name: /^Free/ }));
    expect(within(sheet).queryByTestId("onboarding-service-price")).toBeNull();
    expect(latest().setup.services[0]).toMatchObject({
      paymentMode: "free",
      priceCents: 0,
      depositCents: null,
    });
  });

  it("mentions a service's options and lists problems the app can't edit", async () => {
    api();
    renderWithProviders(
      <Harness
        initial={setupWith((s) => ({
          ...s,
          services: s.services.map((x, i) =>
            i === 1 ? { ...x, options: x.options.map((o, j) => (j === 0 ? { ...o, name: "" } : o)) } : x,
          ),
        }))}
      />,
    );
    fireEvent.press(screen.getByTestId("onboarding-service-1"));
    const sheet = await screen.findByTestId("onboarding-service-sheet");
    expect(within(sheet).getByText(/Includes 2 options, 1 add-on/)).toBeOnTheScreen();
    expect(within(sheet).getByTestId("onboarding-service-other-problems")).toHaveTextContent(
      /Full valet · Option 1 · Name: Name this option/,
    );
  });

  it("adds and removes services", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} />);
    fireEvent.press(screen.getByTestId("onboarding-add-service"));
    const sheet = await screen.findByTestId("onboarding-service-sheet");
    expect(within(sheet).getByTestId("onboarding-service-name")).toHaveDisplayValue("New service");
    expect(latest().setup.services).toHaveLength(3);

    answerAlert("Cancel");
    fireEvent.press(within(sheet).getByTestId("onboarding-service-remove"));
    expect(latest().setup.services).toHaveLength(3);
    jest.restoreAllMocks();
    answerAlert("Remove");
    fireEvent.press(within(sheet).getByTestId("onboarding-service-remove"));
    await waitFor(() => expect(latest().setup.services).toHaveLength(2));
    expect(screen.queryByTestId("onboarding-service-sheet")).toBeNull();
  });

  it("asks for a service when there are none", () => {
    api();
    renderWithProviders(<Harness initial={setupWith((s) => ({ ...s, services: [], questions: [] }))} />);
    expect(
      screen.getByText("Add at least one service so customers have something to book."),
    ).toBeOnTheScreen();
  });

  it("edits a resource's name and weekly hours", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} />);
    expect(screen.getByTestId("onboarding-resource-alex")).toHaveTextContent(/Mon–Wed 09:00–17:00/);
    fireEvent.press(screen.getByTestId("onboarding-resource-alex"));
    const sheet = await screen.findByTestId("onboarding-resource-sheet");
    const hours = () => latest().setup.resources.find((r) => r.key === "alex")!.weeklyHours;

    fireEvent.changeText(within(sheet).getByTestId("onboarding-resource-name"), "Alex M");
    expect(latest().setup.resources[2]?.name).toBe("Alex M");

    fireEvent(within(sheet).getByTestId("onboarding-hours-1-0-start-picker"), "change", at(10));
    expect(hours()[0]).toMatchObject({ dayOfWeek: 1, startTime: "10:00" });
    fireEvent(within(sheet).getByTestId("onboarding-hours-1-0-end-picker"), "change", at(8));
    expect(within(sheet).getByText("Closing time must be after opening time")).toBeOnTheScreen();
    fireEvent(within(sheet).getByTestId("onboarding-hours-1-0-end-picker"), "change", at(13));

    fireEvent.press(within(sheet).getByTestId("onboarding-hours-add-1"));
    expect(hours().filter((h) => h.dayOfWeek === 1)).toHaveLength(2);
    fireEvent.press(within(sheet).getByTestId("onboarding-hours-1-1-remove"));
    expect(hours().filter((h) => h.dayOfWeek === 1)).toHaveLength(1);

    fireEvent(within(sheet).getByTestId("onboarding-hours-open-5"), "valueChange", true);
    expect(hours().some((h) => h.dayOfWeek === 5)).toBe(true);
    fireEvent(within(sheet).getByTestId("onboarding-hours-open-5"), "valueChange", false);
    expect(hours().some((h) => h.dayOfWeek === 5)).toBe(false);

    fireEvent.press(within(sheet).getByTestId("onboarding-hours-copy-monday"));
    expect(
      hours()
        .filter((h) => h.startTime === "10:00")
        .map((h) => h.dayOfWeek),
    ).toEqual([1, 2, 3, 4, 5]);

    fireEvent.press(within(sheet).getByTestId("onboarding-hours-copy-all"));
    expect(latest().setup.resources[0]?.weeklyHours).toEqual(hours());
  });

  it("shows who a window is for", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} />);
    fireEvent.press(screen.getByTestId("onboarding-resource-bay-1"));
    const sheet = await screen.findByTestId("onboarding-resource-sheet");
    expect(within(sheet).getByText("Only for Members")).toBeOnTheScreen();
  });

  it("adds and removes resources", async () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} />);
    fireEvent.press(screen.getByTestId("onboarding-add-resource"));
    const sheet = await screen.findByTestId("onboarding-resource-sheet");
    expect(within(sheet).getByTestId("onboarding-resource-name")).toHaveDisplayValue("Bay 4");
    expect(latest().setup.resources).toHaveLength(4);

    answerAlert("Remove");
    fireEvent.press(within(sheet).getByTestId("onboarding-resource-remove"));
    await waitFor(() => expect(latest().setup.resources).toHaveLength(3));
    expect(screen.queryByTestId("onboarding-resource-sheet")).toBeNull();
  });

  it("jumps to an hours problem in its resource", async () => {
    api();
    renderWithProviders(
      <Harness
        initial={setupWith((s) => ({
          ...s,
          resources: s.resources.map((r) =>
            r.key === "alex" ? { ...r, weeklyHours: [{ ...r.weeklyHours[0]!, endTime: "08:00" }] } : r,
          ),
        }))}
      />,
    );
    expect(screen.getByTestId("onboarding-resource-alex")).toHaveTextContent(/Needs attention/);
    fireEvent.press(screen.getByTestId("onboarding-create"));
    const sheet = await screen.findByTestId("onboarding-resource-sheet");
    expect(within(sheet).getByText("Closing time must be after opening time")).toBeOnTheScreen();
  });

  it("drops a broken question or group the app can't edit", async () => {
    api();
    renderWithProviders(
      <Harness
        initial={setupWith((s) => ({
          ...s,
          questions: s.questions.map((q, i) => (i === 0 ? { ...q, label: "" } : q)),
          customerGroups: [
            ...s.customerGroups,
            { key: "vip", name: "", description: null, restricted: false },
          ],
        }))}
      />,
    );
    expect(screen.getByText("2 things to fix")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("onboarding-remove-questions[0].label"));
    expect(latest().setup.questions).toHaveLength(1);
    fireEvent.press(screen.getByTestId("onboarding-remove-customerGroups[1].name"));
    expect(latest().setup.customerGroups).toHaveLength(1);
    // A list-wide problem has nothing to press, and doesn't open anything.
    await ready();
  });

  it("starts over only when confirmed", async () => {
    api();
    const onStartOver = jest.fn();
    renderWithProviders(<Harness initial={setupWith()} onStartOver={onStartOver} />);
    answerAlert("Cancel");
    fireEvent.press(screen.getByTestId("onboarding-start-over"));
    await act(async () => undefined);
    expect(onStartOver).not.toHaveBeenCalled();
    jest.restoreAllMocks();
    answerAlert("Discard draft");
    fireEvent.press(screen.getByTestId("onboarding-start-over"));
    await waitFor(() => expect(onStartOver).toHaveBeenCalled());
  });

  it("names the template a picked draft came from", () => {
    api();
    renderWithProviders(<Harness initial={setupWith()} origin={{ kind: "template", key: "car_wash" }} />);
    expect(screen.getByTestId("onboarding-source-template")).toHaveTextContent(
      /Started from the car wash template\.$/,
    );
  });
});
