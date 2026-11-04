/** Test helpers for the onboarding steps: the review step over a routed fetch stub, with the Gleam Car Wash fixture. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { type Mock, vi } from "vitest";
import type { BusinessSetup, Membership } from "@/lib/api/types";
import { createDraft } from "@/lib/onboarding/draft";
import { fixture } from "@/lib/onboarding/__tests__/fixture";
import { TooltipProvider } from "@/components/ui/tooltip";
import { json } from "@/components/dashboard/test/render";
import { must } from "@/test/must";
import type { CreatedBusiness, DraftOrigin } from "../draft-storage";
import { ReviewStep } from "../review-step";

export { fixture, json };

export function withProviders(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

/** A 400 with field errors, as the backend sends them. */
export const invalidRequest = (fields: Record<string, string>, message = "Check the highlighted fields.") =>
  json({ error: { code: "INVALID_REQUEST", message, fields } }, 400);

type Route = (body: unknown) => unknown;

/** The template list the source note names the template from. */
export const TEMPLATES = [
  { key: "car_wash", name: "Car wash and valeting", description: "Washes and valets.", icon: "car" },
];

/**
 * The onboarding API: every slug is available unless [taken] says otherwise (then `<slug>-2` is suggested), and
 * `POST /v1/businesses` echoes the setup as a business unless [create] answers instead (a `Response` for an error).
 * `/v1/me` lists [memberships] (none by default).
 */
export function mockOnboardingApi({
  create,
  taken,
  memberships = () => [],
}: { create?: Route; taken?: (slug: string) => boolean; memberships?: () => Membership[] } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/api/, "");
    if (method === "GET" && path === "/v1/public/templates") return json(TEMPLATES);
    if (method === "GET" && path === "/v1/me") {
      const user = { id: "u1", email: "alex@example.test", name: "Alex Morgan", emailVerified: true };
      return json({ user, memberships: memberships(), pendingInvitations: [], hasCustomerBookings: false });
    }
    if (method === "GET" && path === "/v1/businesses/slug-available") {
      const slug = url.searchParams.get("slug") ?? "";
      return json(
        taken?.(slug) ? { available: false, suggestion: `${slug}-2` } : { available: true, suggestion: null },
      );
    }
    if (method === "POST" && path === "/v1/businesses") {
      const body: unknown = JSON.parse(String(init?.body));
      const answer = create?.(body);
      if (answer instanceof Response) return answer;
      const setup = body as BusinessSetup;
      return json({ id: "b-new", slug: setup.slug, name: setup.name, branding: setup.branding });
    }
    return json({ error: { code: "NOT_FOUND", message: `No route for ${method} ${path}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderReview(
  setup: BusinessSetup = fixture(),
  {
    origin = { kind: "template", key: "car_wash" },
    onCreated = vi.fn<(business: CreatedBusiness) => void>(),
    onStartOver = vi.fn<() => void>(),
  }: {
    origin?: DraftOrigin;
    onCreated?: Mock<(business: CreatedBusiness) => void>;
    onStartOver?: Mock<() => void>;
  } = {},
) {
  const view = render(
    withProviders(
      <ReviewStep
        initialDraft={createDraft(setup)}
        origin={origin}
        onCreated={onCreated}
        onStartOver={onStartOver}
      />,
    ),
  );
  return { ...view, onCreated, onStartOver };
}

/**
 * Types [text] into [el] in one go (a paste): the review page re-renders every section per keystroke, so long
 * strings are pasted unless a test is about per-keystroke behaviour.
 */
export async function paste(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

/** The review page renders its summary twice (inline on small screens, in the sidebar on large ones). */
export const createButton = () =>
  must(screen.getAllByRole("button", { name: "Create business" })[0], "Create business button");

/** An item row's toggle ("Bay 1", "Full valet"…): the button that expands it. */
export const rowToggle = (name: string | RegExp) => screen.getByRole("button", { name, expanded: false });
