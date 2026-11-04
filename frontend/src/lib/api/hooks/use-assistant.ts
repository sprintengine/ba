"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { assistantApi } from "../assistant";
import { qk } from "../query-keys";
import type { AgentRequest, AssistantAction, AssistantState, AssistantThread, MemoryEntry } from "../types";
import {
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Bo's state: configured, credits, nudges (owner/admin) and recent threads. */
export function useAssistantState(businessId: string, options?: QueryOptions<AssistantState>) {
  return useQuery({
    staleTime: 60_000,
    ...options,
    queryKey: qk.business(businessId).assistant(),
    queryFn: () => assistantApi.state(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useAssistantThread(
  businessId: string,
  threadId: string | null,
  options?: QueryOptions<AssistantThread>,
) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).assistantThread(threadId ?? ""),
    queryFn: () => assistantApi.thread(businessId, threadId!),
    enabled: enabledWhen(!!businessId && !!threadId, options),
  });
}

export function useCreateThread(businessId: string, options?: MutationOptions<AssistantThread, void>) {
  return useApiMutation(
    () => assistantApi.createThread(businessId),
    (qc, thread) => {
      qc.setQueryData(qk.business(businessId).assistantThread(thread.id), thread);
    },
    options,
  );
}

/**
 * Confirms a proposal: the change runs on the server, so everything of the business is refreshed (the calendar,
 * bookings, services… reflect it), and so are public pages and marketplace listings, which show its services, hours
 * and free times. Confirming twice returns the same result. The card shows the result straight away: the refresh
 * runs in the background rather than holding the mutation until every query of the business has refetched.
 */
export function useConfirmAction(businessId: string, options?: MutationOptions<AssistantAction, string>) {
  return useApiMutation(
    (actionId: string) => assistantApi.confirm(businessId, actionId),
    (qc) => {
      void invalidateAll(qc, [qk.business(businessId).root(), qk.public.all(), qk.marketplace.all()]);
    },
    options,
  );
}

/** Declines a proposal: nothing else changes, but the stored threads now show it declined. */
export function useRejectAction(businessId: string, options?: MutationOptions<AssistantAction, string>) {
  return useApiMutation(
    (actionId: string) => assistantApi.reject(businessId, actionId),
    (qc) => invalidateAll(qc, [qk.business(businessId).assistantThreads()]),
    options,
  );
}

/** The member's own AI apps' proposals here from the last week (§20.8). */
export function useAgentRequests(businessId: string, options?: QueryOptions<AgentRequest[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).agentRequests(),
    queryFn: () => assistantApi.agentRequests(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useAgentRequest(businessId: string, id: string, options?: QueryOptions<AgentRequest>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).agentRequest(id),
    queryFn: () => assistantApi.agentRequest(businessId, id),
    enabled: enabledWhen(!!businessId && !!id, options),
  });
}

/** Approves an AI app's proposal: like confirming Bo's, the change runs here, so everything of the business refreshes. */
export function useApproveAgentRequest(businessId: string, options?: MutationOptions<AgentRequest, string>) {
  return useApiMutation(
    (id: string) => assistantApi.approveAgentRequest(businessId, id),
    (qc, request) => {
      qc.setQueryData(qk.business(businessId).agentRequest(request.action.id), request);
      void invalidateAll(qc, [qk.business(businessId).root(), qk.public.all(), qk.marketplace.all()]);
    },
    options,
  );
}

export function useDeclineAgentRequest(businessId: string, options?: MutationOptions<AgentRequest, string>) {
  return useApiMutation(
    (id: string) => assistantApi.declineAgentRequest(businessId, id),
    (qc, request) => {
      qc.setQueryData(qk.business(businessId).agentRequest(request.action.id), request);
      return invalidateAll(qc, [qk.business(businessId).agentRequests()]);
    },
    options,
  );
}

export function useDismissNudge(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (nudgeId: string) => assistantApi.dismissNudge(businessId, nudgeId),
    (qc, _data, nudgeId) => {
      qc.setQueryData<AssistantState>(
        qk.business(businessId).assistant(),
        (s) => s && { ...s, nudges: s.nudges.filter((n) => n.id !== nudgeId) },
      );
    },
    options,
  );
}

export function useAssistantMemory(businessId: string, options?: QueryOptions<MemoryEntry[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).assistantMemory(),
    queryFn: () => assistantApi.memory(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

const refreshMemory = (businessId: string) => (qc: QueryClient) =>
  invalidateAll(qc, [qk.business(businessId).assistantMemory()]);

export function useAddMemory(businessId: string, options?: MutationOptions<MemoryEntry, string>) {
  return useApiMutation(
    (text: string) => assistantApi.addMemory(businessId, text),
    refreshMemory(businessId),
    options,
  );
}

export function useUpdateMemory(
  businessId: string,
  options?: MutationOptions<MemoryEntry, { id: string; text: string }>,
) {
  return useApiMutation(
    ({ id, text }: { id: string; text: string }) => assistantApi.updateMemory(businessId, id, text),
    refreshMemory(businessId),
    options,
  );
}

export function useDeleteMemory(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => assistantApi.deleteMemory(businessId, id),
    refreshMemory(businessId),
    options,
  );
}
