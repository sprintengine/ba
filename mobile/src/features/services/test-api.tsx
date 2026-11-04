/** Test data and the API stub for the Services tests (not shipped: imported by *.test.tsx only). */
import { useLocalSearchParams } from "expo-router";
import { business } from "@shared/api/__tests__/fixtures/business";
import {
  customerGroup,
  formQuestion,
  formQuestionSparse,
  resource,
  service,
} from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import { releaseSchedule } from "@shared/api/__tests__/fixtures/releases";
import type { Resource, Service } from "@shared/api/types";
import { mockApi } from "~/test/api-mock";
import { ServiceEditorScreen } from "./ServiceEditorScreen";

export const BASE = `/v1/businesses/${business.id}`;

export const assessment: Service = service;
export const massage: Service = {
  ...service,
  id: "svc-massage",
  name: "Sports massage",
  category: "Massage",
  sortOrder: 1,
  paymentMode: "at_venue",
  depositCents: null,
  allowPayAtVenue: false,
  priceCents: 5000,
  options: [],
  addons: [],
  allowedGroupIds: [],
  requirements: [{ ...service.requirements[0]!, id: "req-2", customerSelectable: false }],
};
export const oldClass: Service = {
  ...massage,
  id: "svc-old",
  name: "Old class",
  category: null,
  sortOrder: 2,
  isActive: false,
  isPublic: false,
  capacity: 8,
};

export const jordan: Resource = { ...resource, id: ids.resource2, name: "Jordan Casey", memberId: null };

export type Handler = (method: string, path: string, body: unknown) => unknown;

/** The services API: `services` listed, saves echoing the body, plus everything the editor reads. */
export function servicesApi(services: Service[] = [assessment, massage, oldClass], handle?: Handler) {
  return mockApi((method, path, body) => {
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === `${BASE}/services`) return services;
    if (method === "PUT" && path.startsWith(`${BASE}/services/`)) {
      const id = decodeURIComponent(path.split("/").pop()!);
      const current = services.find((s) => s.id === id)!;
      return { ...current, ...(body as object) };
    }
    if (method === "POST" && path === `${BASE}/services`)
      return { ...service, ...(body as object), id: "svc-new" };
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (path === `${BASE}/resources`) return [resource, jordan];
    if (path === `${BASE}/customer-groups`) return [customerGroup];
    if (path === `${BASE}/questions`)
      return [formQuestion, { ...formQuestionSparse, id: "q-all", label: "Anything else?", required: false }];
    if (path === `${BASE}/release-schedules`) return [releaseSchedule];
    return undefined;
  });
}

/** The phone's editor route, as app/dashboard/[slug]/services/[id].tsx renders it. */
export function EditorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ServiceEditorScreen id={id} />;
}

/** The request bodies sent with `method`. */
export const bodies = (fetch: jest.Mock, method: string) =>
  fetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
