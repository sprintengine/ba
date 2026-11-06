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
import { Button } from "@/components/ui/button";
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
import { SettingGroup, SettingItem, SettingList, SettingsHeader } from "./settings-common";

/** Common first questions: choosing one opens the dialog with it written in, to accept or change. */
const STARTERS = ["Reason for your visit", "Vehicle registration", "Anything we should know?"];

export function QuestionsSettings() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const questions = useQuestions(business.id);
  const services = useServices(business.id);
  const update = useUpdateQuestion(business.id);
  const remove = useDeleteQuestion(business.id);
  const [filter, setFilter] = useState("all");
  const editor = useEditorDialog<FormQuestion>();
  const [starter, setStarter] = useState("");
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

  const addStarter = (label: string) => {
    setStarter(label);
    editor.open(null);
  };

  const newQuestion = (
    <ActionButton
      size="sm"
      variant="primary"
      onClick={() => addStarter("")}
      icon={<Plus />}
      label="New question"
      collapse={false}
    />
  );

  return (
    <>
      <SettingsHeader segment="questions" lede actions={all.length > 0 && newQuestion} />
      {questions.isError ? (
        <ErrorState error={questions.error} onRetry={() => questions.refetch()} />
      ) : questions.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <SettingGroup
          title="Your questions"
          // With none yet the empty state says it all, with something to click.
          description={
            list.length > 0
              ? "Asked after people pick a time. Name and email are always asked for."
              : undefined
          }
          action={
            (services.data?.length ?? 0) > 0 &&
            (list.length > 0 || filter !== "all") && (
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger size="sm" className="w-full sm:w-48" aria-label="Filter by service">
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
            )
          }
        >
          {list.length === 0 ? (
            <EmptyState
              headingLevel={4}
              icon={<MessageSquareText />}
              title="No questions yet"
              description="People are asked these after they pick a time. Start from one of these, or write your own."
              action={
                all.length === 0 && (
                  <>
                    {STARTERS.map((label) => (
                      <Button key={label} size="sm" variant="secondary" onClick={() => addStarter(label)}>
                        <Plus /> {label}
                      </Button>
                    ))}
                    {newQuestion}
                  </>
                )
              }
            />
          ) : (
            <SettingList>
              {list.map((q) => (
                <SettingItem
                  key={q.id}
                  dimmed={!q.isActive}
                  leading={
                    filter === "all" && (
                      <div className="-ml-1.5 flex flex-col">
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
                    )
                  }
                  title={q.label}
                  chips={
                    <>
                      {q.required && <Badge className="h-5">Required</Badge>}
                      {q.sensitive && <SensitiveMark />}
                      {!q.isActive && <Badge className="h-5">Off</Badge>}
                    </>
                  }
                  meta={
                    <span className="truncate text-[0.8125rem] leading-5 text-muted-foreground">
                      {KIND_LABEL[q.kind]}
                      {q.kind === "select" ? `: ${q.options.join(", ")}` : ""} · {serviceName(q.serviceId)}
                    </span>
                  }
                  actions={
                    <>
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
                    </>
                  }
                />
              ))}
            </SettingList>
          )}
        </SettingGroup>
      )}
      {editor.current && (
        <QuestionDialog
          key={editor.current.key}
          question={editor.current.item}
          nextSort={nextSortOrder(all)}
          defaultService={filter !== "all" && filter !== "global" ? filter : ALL_SERVICES}
          starter={editor.current.item ? undefined : starter}
          {...editor.dialogProps}
        />
      )}
    </>
  );
}
