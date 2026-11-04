import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import type { ReactElement } from "react";
import { Alert, Share, type AlertButton } from "react-native";
import { business as businessFixture, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import type { BusinessSetup, Me, TemplateSummary } from "@shared/api/types";
import { createDraft } from "@shared/onboarding/draft";
import { fixture } from "@shared/onboarding/__tests__/fixture";
import { apiError, calls, json, mockApi, pending } from "~/test/api-mock";
import { authState, Providers, testQueryClient } from "~/test/render";
import { Text } from "~/ui";
import OnboardingLayout from "../../../app/onboarding/_layout";
import OnboardingRoute from "../../../app/onboarding/index";
import { loadDraft, saveDraft } from "./draft-storage";

const USER = "dev_owner";
const auth = authState({
  user: { id: USER, email: "owner@example.test", name: "Avery Morgan", imageUrl: null },
});

const TEMPLATES: TemplateSummary[] = [
  { key: "car_wash", name: "Car wash", description: "Bays and valets", icon: "car" },
  { key: "physio", name: "Physiotherapy", description: "Rooms and physios", icon: "Stethoscope" },
  { key: "generic", name: "Something else", description: "Blank", icon: "calendar" },
];

const DESCRIPTION = "A two-bay hand car wash in Galway, open Monday to Saturday, washes from €15.";

type Route = (method: string, path: string, body: unknown) => unknown;

/** The backend for a new business: templates, an AI draft, a free address and the create. */
function api(handle?: Route, { me = meFixture as Me, loseCreate = false } = {}) {
  let current = me;
  return mockApi((method, path, body) => {
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === "/v1/me") return current;
    if (method === "GET" && path === "/v1/public/templates") return TEMPLATES;
    if (method === "GET" && path === "/v1/public/templates/car_wash") return fixture();
    if (method === "POST" && path === "/v1/ai/business-draft") return { ...fixture(), source: "ai" };
    if (method === "GET" && path === "/v1/businesses/slug-available")
      return { available: true, suggestion: null };
    if (method === "POST" && path === "/v1/businesses") {
      const setup = body as BusinessSetup;
      const created = { ...businessFixture, id: "b_new", slug: setup.slug ?? "new", name: setup.name };
      current = {
        ...current,
        memberships: [
          ...current.memberships,
          {
            businessId: "b_new",
            slug: created.slug,
            name: created.name,
            role: "owner",
            branding: created.branding,
          },
        ],
      };
      // The business is made, but the response never reaches the app.
      return loseCreate ? apiError(503, "SERVICE_UNAVAILABLE", "Can't reach bookanything") : created;
    }
    return undefined;
  });
}

function Home(): ReactElement {
  return <Text testID="home">Home</Text>;
}

function Dashboard(): ReactElement {
  return <Text testID="dashboard">Dashboard</Text>;
}

/** The real `/onboarding` route files, opened over a home screen (as the switcher does). */
async function openOnboarding() {
  const client = testQueryClient();
  // No 5-minute garbage-collection timer for finished mutations.
  client.setDefaultOptions({ ...client.getDefaultOptions(), mutations: { retry: false, gcTime: Infinity } });
  const result = renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      index: Home,
      "onboarding/_layout": OnboardingLayout,
      "onboarding/index": OnboardingRoute,
      "dashboard/[slug]/index": Dashboard,
    },
    {
      initialUrl: "/",
      wrapper: ({ children }) => (
        <Providers auth={auth} client={client}>
          {children as ReactElement}
        </Providers>
      ),
    },
  );
  act(() => router.push("/onboarding"));
  await screen.findByTestId("onboarding");
  return { ...result, client };
}

/** Answers the next native alert with the button labelled [label]. */
function answerAlert(label: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === label)?.onPress?.();
  });
}

async function describeAndDraft(name = "") {
  if (name) fireEvent.changeText(screen.getByTestId("onboarding-name"), name);
  fireEvent.changeText(screen.getByTestId("onboarding-description"), DESCRIPTION);
  fireEvent.press(screen.getByTestId("onboarding-draft"));
  return screen.findByTestId("onboarding-review", {}, { timeout: 3000 });
}

describe("OnboardingScreen", () => {
  it("drafts with AI, reviews, creates the business and opens its dashboard", async () => {
    const mock = api();
    const app = await openOnboarding();
    expect(await screen.findByText("Welcome, Avery")).toBeOnTheScreen();
    expect(await screen.findByTestId("onboarding-template-car_wash")).toBeOnTheScreen();

    await describeAndDraft("Shine Bros");
    const draftCall = mock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((draftCall?.[1] as RequestInit).body))).toEqual({
      description: `${DESCRIPTION}\n\nThe business is called Shine Bros.`,
      websiteUrl: null,
    });

    expect(screen.getByTestId("onboarding-source-ai")).toBeOnTheScreen();
    expect(screen.getByText("Shine Bros")).toBeOnTheScreen();
    expect(screen.getByText("Exterior wash")).toBeOnTheScreen();
    expect(screen.getByText("Bay 1")).toBeOnTheScreen();
    expect(screen.getByTestId("onboarding-also-included")).toHaveTextContent(
      "Also included: 2 booking questions and 1 customer group. Change them in Settings after you create your business.",
    );
    // The draft is kept on the phone while it's reviewed.
    expect(loadDraft(USER)?.draft.setup.name).toBe("Shine Bros");

    await waitFor(() => expect(screen.getByText("Booking page address · available")).toBeOnTheScreen());
    expect(screen.getByText("Ready to create")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("onboarding-create"));

    expect(await screen.findByText("Shine Bros is ready")).toBeOnTheScreen();
    const created = mock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/v1/businesses") && (init as RequestInit | undefined)?.method === "POST",
    );
    const body = JSON.parse(String((created?.[1] as RequestInit).body)) as BusinessSetup;
    expect(body).toMatchObject({ name: "Shine Bros", slug: "shine-bros", currency: "EUR" });
    expect(body.services.map((s) => s.name)).toEqual(["Exterior wash", "Full valet"]);
    // `me` is refreshed after the create, so the switcher lists the new business.
    const log = calls(mock);
    expect(log.lastIndexOf("GET /v1/me")).toBeGreaterThan(log.indexOf("POST /v1/businesses"));
    expect(loadDraft(USER)).toBeNull();

    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    fireEvent.press(screen.getByTestId("onboarding-share"));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/\/shine-bros$/) }),
    );

    fireEvent.press(screen.getByTestId("onboarding-open-dashboard"));
    expect(await screen.findByTestId("dashboard")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/dashboard/shine-bros");
  });

  it("says when AI isn't available and the draft came from the closest template", async () => {
    api((method, path) =>
      method === "POST" && path === "/v1/ai/business-draft"
        ? { ...fixture(), source: "template" }
        : undefined,
    );
    await openOnboarding();
    await describeAndDraft();
    expect(screen.getByTestId("onboarding-source-template")).toHaveTextContent(
      /Started from the Car wash template\. AI isn't available right now/,
    );
    // No name typed: the draft's own name and address.
    expect(screen.getByText("Gleam Car Wash")).toBeOnTheScreen();
  });

  it("keeps the description when drafting fails, and tries again", async () => {
    let fail = true;
    api((method, path) => {
      if (method !== "POST" || path !== "/v1/ai/business-draft") return undefined;
      if (fail) return apiError(502, "AI_UNAVAILABLE", "The assistant is busy.");
      return { ...fixture(), source: "ai" };
    });
    await openOnboarding();
    fireEvent.changeText(screen.getByTestId("onboarding-description"), DESCRIPTION);
    fireEvent.press(screen.getByTestId("onboarding-draft"));
    expect(await screen.findByTestId("onboarding-draft-error")).toBeOnTheScreen();
    expect(screen.getByText("The assistant is busy.")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("onboarding-draft-back"));
    expect(screen.getByTestId("onboarding-description")).toHaveDisplayValue(DESCRIPTION);
    fireEvent.press(screen.getByTestId("onboarding-draft"));
    expect(await screen.findByTestId("onboarding-draft-error")).toBeOnTheScreen();

    fail = false;
    fireEvent.press(screen.getByTestId("onboarding-draft-retry"));
    expect(await screen.findByTestId("onboarding-review")).toBeOnTheScreen();
  });

  it("explains a rate limit", async () => {
    api((method, path) =>
      method === "POST" && path === "/v1/ai/business-draft"
        ? apiError(429, "RATE_LIMITED", "Too many requests")
        : undefined,
    );
    await openOnboarding();
    fireEvent.changeText(screen.getByTestId("onboarding-description"), DESCRIPTION);
    fireEvent.press(screen.getByTestId("onboarding-draft"));
    expect(await screen.findByText(/You've drafted a lot in a short time/)).toBeOnTheScreen();
  });

  it("shows the steps while the draft is being written", async () => {
    jest.useFakeTimers();
    try {
      api((method, path) => (method === "POST" && path === "/v1/ai/business-draft" ? pending() : undefined));
      const app = await openOnboarding();
      fireEvent.changeText(screen.getByTestId("onboarding-description"), DESCRIPTION);
      fireEvent.press(screen.getByTestId("onboarding-draft"));
      expect(await screen.findByTestId("onboarding-drafting")).toBeOnTheScreen();
      expect(screen.getByLabelText("Reading your description, in progress")).toBeOnTheScreen();
      act(() => jest.advanceTimersByTime(1400 * 5));
      expect(screen.getByLabelText("Reading your description, done")).toBeOnTheScreen();
      expect(screen.getByLabelText("Writing booking questions, in progress")).toBeOnTheScreen();
      app.unmount();
      act(() => jest.runOnlyPendingTimers());
    } finally {
      jest.useRealTimers();
    }
  });

  it("asks for more than a few words before drafting", async () => {
    const mock = api();
    await openOnboarding();
    fireEvent.changeText(screen.getByTestId("onboarding-description"), "Car wash");
    fireEvent.changeText(screen.getByTestId("onboarding-website"), "not a url");
    fireEvent.press(screen.getByTestId("onboarding-draft"));
    expect(await screen.findByText(/Tell us a little more/)).toBeOnTheScreen();
    expect(screen.getByText("Enter a web address like example.ie")).toBeOnTheScreen();
    expect(calls(mock)).not.toContain("POST /v1/ai/business-draft");

    // An example fills the description.
    fireEvent.press(screen.getByTestId("onboarding-example-Car wash"));
    expect(screen.getByTestId("onboarding-description")).toHaveDisplayValue(/Gleam Car Wash/);
  });

  it("starts from a template, named what the owner typed", async () => {
    api();
    await openOnboarding();
    fireEvent.changeText(screen.getByTestId("onboarding-name"), "Suds & Co");
    fireEvent.press(await screen.findByTestId("onboarding-template-car_wash"));
    expect(await screen.findByTestId("onboarding-review")).toBeOnTheScreen();
    expect(screen.getByTestId("onboarding-source-template")).toHaveTextContent(
      /Started from the Car wash template\.$/,
    );
    expect(screen.getByText("Suds & Co")).toBeOnTheScreen();
    expect(screen.getByText(/\/suds-and-co$/)).toBeOnTheScreen();
  });

  it("offers a retry when a template doesn't load", async () => {
    let fail = true;
    api((method, path) =>
      method === "GET" && path === "/v1/public/templates/car_wash" && fail
        ? apiError(500, "INTERNAL", "Server error")
        : undefined,
    );
    await openOnboarding();
    fireEvent.press(await screen.findByTestId("onboarding-template-car_wash"));
    expect(await screen.findByTestId("onboarding-template-error")).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByTestId("onboarding-template-retry"));
    expect(await screen.findByTestId("onboarding-review")).toBeOnTheScreen();
  });

  it("goes back from a template that doesn't exist", async () => {
    api((method, path) =>
      method === "GET" && path === "/v1/public/templates/physio"
        ? apiError(404, "NOT_FOUND", "No")
        : undefined,
    );
    await openOnboarding();
    fireEvent.press(await screen.findByTestId("onboarding-template-physio"));
    expect(await screen.findByText(/We couldn't find the "physio" template/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("onboarding-template-back"));
    expect(screen.getByTestId("onboarding-describe")).toBeOnTheScreen();
  });

  it("offers a retry when the templates don't load", async () => {
    let fail = true;
    api((method, path) =>
      method === "GET" && path === "/v1/public/templates" && fail
        ? apiError(500, "INTERNAL", "Down")
        : undefined,
    );
    await openOnboarding();
    expect(await screen.findByText(/Down You can still describe your business above/)).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByTestId("onboarding-templates-retry"));
    expect(await screen.findByTestId("onboarding-template-car_wash")).toBeOnTheScreen();
    expect(screen.getByTestId("onboarding-template-generic")).toBeOnTheScreen();
  });

  it("closes at once when nothing was entered", async () => {
    api();
    const alert = jest.spyOn(Alert, "alert");
    const app = await openOnboarding();
    fireEvent.press(screen.getByTestId("onboarding-cancel"));
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/");
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks before discarding what was typed", async () => {
    api();
    const app = await openOnboarding();
    fireEvent.changeText(screen.getByTestId("onboarding-description"), "Something");

    let alert = answerAlert("Keep editing");
    fireEvent.press(screen.getByTestId("onboarding-cancel"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Discard this business?",
        "What you've entered so far will be lost.",
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(app.getPathname()).toBe("/onboarding");

    alert.mockRestore();
    alert = answerAlert("Discard");
    fireEvent.press(screen.getByTestId("onboarding-cancel"));
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
  });

  it("keeps a reviewed draft for later, picks it up again, or discards it", async () => {
    api();
    const app = await openOnboarding();
    await describeAndDraft("Shine Bros");

    answerAlert("Save for later");
    fireEvent.press(screen.getByTestId("onboarding-cancel"));
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(loadDraft(USER)?.draft.setup.name).toBe("Shine Bros");

    jest.restoreAllMocks();
    api();
    act(() => router.push("/onboarding"));
    expect(await screen.findByTestId("onboarding-review")).toBeOnTheScreen();
    expect(screen.getByText("Shine Bros")).toBeOnTheScreen();
    expect(await screen.findByText("Picked up your draft where you left off")).toBeOnTheScreen();

    answerAlert("Discard draft");
    fireEvent.press(screen.getByTestId("onboarding-cancel"));
    expect(await screen.findByTestId("home")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/");
    expect(loadDraft(USER)).toBeNull();
  });

  it("starts over from the review", async () => {
    api();
    await openOnboarding();
    await describeAndDraft();
    answerAlert("Discard draft");
    fireEvent.press(screen.getByTestId("onboarding-start-over"));
    expect(await screen.findByTestId("onboarding-describe")).toBeOnTheScreen();
    expect(loadDraft(USER)).toBeNull();
    // The description is still there to draft again.
    expect(screen.getByTestId("onboarding-description")).toHaveDisplayValue(DESCRIPTION);
  });

  it("doesn't restore someone else's draft", async () => {
    saveDraft("someone_else", { draft: createDraft(fixture()), origin: { kind: "ai" } });
    api();
    await openOnboarding();
    expect(screen.getByTestId("onboarding-describe")).toBeOnTheScreen();
  });

  it("recognises a business whose create response was lost", async () => {
    api(undefined, { loseCreate: true });
    await openOnboarding();
    await describeAndDraft("Shine Bros");
    await waitFor(() => expect(screen.getByText("Ready to create")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("onboarding-create"));
    expect(await screen.findByText("Shine Bros is ready")).toBeOnTheScreen();
  });

  it("says why a create failed", async () => {
    api((method, path) =>
      method === "POST" && path === "/v1/businesses"
        ? json({ error: { code: "VALIDATION_ERROR", message: "Check the services", fields: {} } }, 400)
        : undefined,
    );
    await openOnboarding();
    await describeAndDraft("Shine Bros");
    await waitFor(() => expect(screen.getByText("Ready to create")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("onboarding-create"));
    expect(await screen.findByTestId("onboarding-create-error")).toHaveTextContent("Check the services");
    expect(screen.getByTestId("onboarding-review")).toBeOnTheScreen();
  });
});
