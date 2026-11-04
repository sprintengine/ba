/**
 * A stateful fake of the site API (§15.5) over the dashboard test `fetch` mock: saves create
 * versions, publish copies the draft, restore copies a version, AI calls return canned results.
 */
import type { SiteAiResult, SitePlan, SiteState, SiteVersion } from "@/lib/api/types";
import { SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { json, mockApi } from "../../test/render";

export type FakeSite = {
  state: SiteState;
  versions: (SiteVersion & { plan: SitePlan })[];
  calls: { method: string; path: string; body: unknown }[];
  /** Override the next AI response (e.g. an error Response). */
  nextAi: Response | ((kind: "generate" | "edit", body: unknown) => SiteAiResult) | null;
  fetch: ReturnType<typeof mockApi>;
};

/** A business with plenty of AI credits left. */
export const SAMPLE_CREDITS = {
  limit: 100,
  used: 20,
  remaining: 80,
  runningLow: false,
  limitReached: false,
  resetsOn: "2026-11-01",
  overage: false,
};

export function siteState(patch: Partial<SiteState> = {}): SiteState {
  const plan = samplePlan("calm");
  return {
    draft: plan,
    draftVersion: 1,
    published: plan,
    publishedVersion: 1,
    publishedAt: "2026-09-29T10:00:00+01:00",
    updatedAt: "2026-09-29T10:00:00+01:00",
    hasUnpublishedChanges: false,
    context: SAMPLE_CONTEXT,
    ai: { model: false, credits: SAMPLE_CREDITS },
    stock: { enabled: false },
    uploads: { enabled: true, maxBytes: 5 * 1024 * 1024 },
    ...patch,
  };
}

const version = (
  v: number,
  plan: SitePlan,
  source: SiteVersion["source"],
  extra: Partial<SiteVersion> = {},
) => ({
  version: v,
  source,
  instruction: null,
  changes: [],
  actorType: "owner",
  actorName: "Avery Morgan",
  createdAt: "2026-09-29T10:00:00+01:00",
  isPublished: false,
  isDraft: false,
  plan,
  ...extra,
});

export function fakeSiteApi(initial: SiteState = siteState()): FakeSite {
  const fake: FakeSite = {
    state: initial,
    versions: [version(1, initial.draft, "seed")],
    calls: [],
    nextAi: null,
    fetch: undefined as unknown as ReturnType<typeof mockApi>,
  };
  const newVersion = (plan: SitePlan, source: SiteVersion["source"], extra: Partial<SiteVersion> = {}) => {
    const v = (fake.versions.at(-1)?.version ?? 0) + 1;
    fake.versions.push(version(v, plan, source, extra));
    fake.state = { ...fake.state, draft: plan, draftVersion: v, hasUnpublishedChanges: true };
    return v;
  };
  const listed = () => ({
    items: [...fake.versions].reverse().map(({ plan: _plan, ...v }) => ({
      ...v,
      isDraft: v.version === fake.state.draftVersion,
      isPublished: v.version === fake.state.publishedVersion,
    })),
  });
  const ai = (kind: "generate" | "edit", body: unknown): Response | SiteAiResult => {
    const next = fake.nextAi;
    fake.nextAi = null;
    if (next instanceof Response) return next;
    if (next) return next(kind, body);
    const previous = fake.state.draftVersion;
    const plan = {
      ...fake.state.draft,
      theme: kind === "generate" ? ("bold" as const) : ("playful" as const),
    };
    const changes = [kind === "generate" ? "Theme: Calm → Bold" : "Theme: Calm → Playful", "Edited Hero"];
    newVersion(plan, kind === "generate" ? "ai_generate" : "ai_edit", {
      changes,
      instruction: (body as { instruction?: string }).instruction ?? null,
    });
    const used = fake.state.ai.credits.used + (fake.state.ai.model ? 7 : 0);
    fake.state = {
      ...fake.state,
      ai: {
        ...fake.state.ai,
        credits: { ...fake.state.ai.credits, used, remaining: fake.state.ai.credits.limit - used },
      },
    };
    return { state: fake.state, source: "template", changes, previousVersion: previous, message: null };
  };

  fake.fetch = mockApi((method, path, body) => {
    fake.calls.push({ method, path, body });
    if (path.endsWith("/services")) return SAMPLE_SERVICES;
    if (path.endsWith("/site") && method === "GET") return fake.state;
    if (path.endsWith("/site") && method === "PUT") {
      const { plan, baseVersion } = body as { plan: SitePlan; baseVersion: number | null };
      if (baseVersion != null && baseVersion !== fake.state.draftVersion) {
        return json(
          { error: { code: "CONFLICT", message: "The site was changed elsewhere.", fields: {} } },
          409,
        );
      }
      newVersion(plan, "owner");
      return fake.state;
    }
    if (path.endsWith("/site/publish")) {
      fake.state = {
        ...fake.state,
        published: fake.state.draft,
        publishedVersion: fake.state.draftVersion,
        hasUnpublishedChanges: false,
      };
      return fake.state;
    }
    if (path.endsWith("/site/versions")) return listed();
    const restore = path.match(/\/site\/versions\/(\d+)\/restore$/);
    if (restore) {
      const from = fake.versions.find((v) => v.version === Number(restore[1]))!;
      newVersion(from.plan, "restore", { instruction: `Restored version ${from.version}` });
      return fake.state;
    }
    if (path.endsWith("/site/generate")) return ai("generate", body);
    if (path.endsWith("/site/edit")) return ai("edit", body);
    if (path.endsWith("/site/stock/download")) return new Response(null, { status: 204 });
    if (path.endsWith("/site/stock")) return { enabled: fake.state.stock.enabled, results: [] };
    if (path.endsWith("/uploads")) {
      return json(
        {
          url: "http://localhost:3000/api/v1/public/uploads/b1/0f0f0f0f-0000-4000-8000-000000000001.png",
          contentType: "image/png",
          bytes: 68,
          width: 1,
          height: 1,
        },
        201,
      );
    }
    return [];
  });
  return fake;
}
