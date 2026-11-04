"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import type { FormQuestion } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/client";
import { useDeleteQuestion, useQuestions, useServices, useUpdateQuestion } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { nextSortOrder } from "@/lib/dashboard/sort-order";
import { ALL_SERVICES, KIND_LABEL } from "@/lib/settings/question-form";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { IconButton } from "@/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";
import { SensitiveMark } from "../common";
import { QuestionDialog } from "./question-dialog";
import { SettingsHeader } from "./settings-common";

export function QuestionsSettings() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const questions = useQuestions(business.id);
  const services = useServices(business.id);
  const update = useUpdateQuestion(business.id);
  const remove = useDeleteQuestion(business.id);
  const [filter, setFilter] = useState("all");
  const editor = useEditorDialog<FormQuestion>();
  const serviceName = (id: string | null) =>
    id ? (services.data?.find((s) => s.id === id)?.name ?? "A service") : "All services";
  const all = [...(questions.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const list = all.filter(
    (q) => filter === "all" || (filter === "global" ? q.serviceId === null : q.serviceId === filter),
  );

  const move = async (q: FormQuestion, dir: -1 | 1) => {
    const i = all.findIndex((x) => x.id === q.id);
    const other = all[i + dir];
    if (!other) return;
    try {
      await Promise.all([
        update.mutateAsync({
          id: q.id,
          input: { sortOrder: other.sortOrder === q.sortOrder ? i + dir : other.sortOrder },
        }),
        update.mutateAsync({
          id: other.id,
          input: { sortOrder: other.sortOrder === q.sortOrder ? i : q.sortOrder },
        }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <SettingsHeader
        segment="questions"
        actions={
          <ActionButton
            size="sm"
            variant="primary"
            onClick={() => editor.open(null)}
            icon={<Plus />}
            label="New question"
          />
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Asked after people pick a time. Name, email and phone are always collected.
        </p>
        {(services.data?.length ?? 0) > 0 && (
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger size="sm" className="w-full sm:w-48 sm:shrink-0" aria-label="Filter by service">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">Every question</SelectItem>
              <SelectItem value="global">Asked for all services</SelectItem>
              <SelectSeparator />
              {services.data!.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {questions.isError ? (
        <ErrorState error={questions.error} onRetry={() => questions.refetch()} />
      ) : questions.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <EmptyState
            icon={<MessageSquareText />}
            title="No questions"
            description="Ask for what you need to prepare — a vehicle registration, an instrument, the reason for a visit."
          />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {list.map((q) => (
            <li key={q.id} className="flex items-center gap-3 px-4 py-3">
              {filter === "all" && (
                <div className="flex flex-col">
                  <IconButton
                    size="xs"
                    label={`Move “${q.label}” up`}
                    tooltip={false}
                    disabled={update.isPending || all[0]?.id === q.id}
                    onClick={() => move(q, -1)}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    size="xs"
                    label={`Move “${q.label}” down`}
                    tooltip={false}
                    disabled={update.isPending || all[all.length - 1]?.id === q.id}
                    onClick={() => move(q, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {q.label}
                  {q.required && <Badge className="h-5">Required</Badge>}
                  {q.sensitive && <SensitiveMark />}
                  {!q.isActive && <Badge className="h-5">Off</Badge>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {KIND_LABEL[q.kind]}
                  {q.kind === "select" ? `: ${q.options.join(", ")}` : ""} · {serviceName(q.serviceId)}
                </span>
              </div>
              <IconButton label={`Edit “${q.label}”`} onClick={() => editor.open(q)}>
                <Pencil />
              </IconButton>
              <ConfirmDialog
                trigger={
                  <IconButton label={`Delete “${q.label}”`}>
                    <Trash2 />
                  </IconButton>
                }
                title="Delete this question?"
                description={`Answers already given stay on past ${v("bookings")}.`}
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  await withToast(() => remove.mutateAsync(q.id), "Question deleted");
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {editor.current && (
        <QuestionDialog
          key={editor.current.key}
          question={editor.current.item}
          nextSort={nextSortOrder(all)}
          defaultService={filter !== "all" && filter !== "global" ? filter : ALL_SERVICES}
          {...editor.dialogProps}
        />
      )}
    </>
  );
}
