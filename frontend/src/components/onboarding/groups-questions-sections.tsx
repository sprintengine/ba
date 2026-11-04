"use client";

import { Lock, MessageSquareText, Plus, Trash2, UsersRound, X } from "lucide-react";
import type { BusinessSetup, FormQuestionKind } from "@/lib/api/types";
import { QUESTION_KIND_LABEL, QUESTION_KINDS } from "@/lib/catalog/questions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ItemRow, SectionCard } from "./section-card";
import type { SetupAction } from "@/lib/onboarding/actions";
import type { SetupErrors } from "@/lib/onboarding/types";

type SectionProps = {
  setup: BusinessSetup;
  errors: SetupErrors;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: (action: SetupAction) => void;
};

export function GroupsSection({ setup, errors, open, onOpenChange, dispatch }: SectionProps) {
  const groups = setup.customerGroups;
  const problems = Object.keys(errors).filter((k) => k.startsWith("customerGroups")).length;
  const customers = setup.vocabulary.customers.toLowerCase();
  return (
    <SectionCard
      id="section-groups"
      icon={<UsersRound />}
      title={`${setup.vocabulary.customer} groups`}
      summary={
        groups.length === 0
          ? `Optional. Everyone books the same way.`
          : groups.map((g) => g.name || "Unnamed").join(" · ")
      }
      problems={problems}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Groups let some {customers} see different services or times, like members, new students or medical
          card holders.
        </p>
        {groups.length > 0 && (
          <ul className="flex flex-col gap-2">
            {groups.map((g, i) => {
              const p = `customerGroups[${i}].`;
              return (
                <li
                  key={g.key}
                  id={`item-groups-${i}`}
                  className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-border-subtle p-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-start">
                    <Field error={errors[`${p}name`]}>
                      <Input
                        size="sm"
                        aria-label="Group name"
                        value={g.name}
                        maxLength={100}
                        placeholder="Group name"
                        onChange={(e) =>
                          dispatch({ type: "updateGroup", key: g.key, patch: { name: e.target.value } })
                        }
                      />
                    </Field>
                    <Field error={errors[`${p}description`]}>
                      <Input
                        size="sm"
                        aria-label="Group description"
                        value={g.description ?? ""}
                        maxLength={500}
                        placeholder="Description (optional)"
                        onChange={(e) =>
                          dispatch({
                            type: "updateGroup",
                            key: g.key,
                            patch: { description: e.target.value },
                          })
                        }
                      />
                    </Field>
                    <IconButton
                      label={`Remove ${g.name || "group"}`}
                      size="sm"
                      className="hidden sm:inline-flex"
                      onClick={() => dispatch({ type: "removeGroup", key: g.key })}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        size="sm"
                        checked={g.restricted}
                        onCheckedChange={(restricted) =>
                          dispatch({ type: "updateGroup", key: g.key, patch: { restricted } })
                        }
                      />
                      Only book times reserved for this group
                    </label>
                    <Button
                      size="xs"
                      variant="danger-ghost"
                      className="sm:hidden"
                      aria-label={`Remove ${g.name || "group"}`}
                      onClick={() => dispatch({ type: "removeGroup", key: g.key })}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {errors.customerGroups && (
          <p role="alert" className="text-xs font-medium text-danger-soft-foreground">
            {errors.customerGroups}
          </p>
        )}
        <Button size="sm" className="self-start" onClick={() => dispatch({ type: "addGroup" })}>
          <Plus />
          Add group
        </Button>
      </div>
    </SectionCard>
  );
}

const ALL_SERVICES = "__all__";

export function QuestionsSection({
  setup,
  errors,
  open,
  onOpenChange,
  expandedIndex,
  onExpand,
  dispatch,
}: SectionProps & { expandedIndex: number | null; onExpand: (index: number | null) => void }) {
  const questions = setup.questions;
  const problems = Object.keys(errors).filter((k) => k.startsWith("questions")).length;
  const booking = setup.vocabulary.booking.toLowerCase();
  return (
    <SectionCard
      id="section-questions"
      icon={<MessageSquareText />}
      title="Booking questions"
      summary={
        questions.length === 0
          ? `Optional. Ask for anything you need before a ${booking}.`
          : `${questions.length} ${questions.length === 1 ? "question" : "questions"} asked when booking.`
      }
      problems={problems}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col gap-3">
        {questions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {questions.map((q, i) => {
              const p = `questions[${i}].`;
              const invalid = Object.keys(errors).some((k) => k.startsWith(p));
              return (
                <ItemRow
                  key={i}
                  id={`item-questions-${i}`}
                  expanded={expandedIndex === i}
                  onToggle={() => onExpand(expandedIndex === i ? null : i)}
                  invalid={invalid}
                  title={q.label.trim() || "Untitled question"}
                  meta={[
                    QUESTION_KIND_LABEL[q.kind],
                    q.required ? "Required" : "Optional",
                    q.serviceName ? `Only for ${q.serviceName}` : "All services",
                  ].join(" · ")}
                  aside={
                    q.sensitive ? (
                      <Badge tone="warning">
                        <Lock />
                        Sensitive
                      </Badge>
                    ) : undefined
                  }
                >
                  <div className="flex flex-col gap-4">
                    <Field label="Question" required error={errors[`${p}label`]}>
                      <Input
                        value={q.label}
                        maxLength={200}
                        placeholder="e.g. What would you like help with?"
                        onChange={(e) =>
                          dispatch({ type: "updateQuestion", index: i, patch: { label: e.target.value } })
                        }
                      />
                    </Field>
                    <Field label="Help text" optional error={errors[`${p}helpText`]}>
                      <Input
                        value={q.helpText ?? ""}
                        maxLength={500}
                        onChange={(e) =>
                          dispatch({ type: "updateQuestion", index: i, patch: { helpText: e.target.value } })
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Answer type" error={errors[`${p}kind`]}>
                        <Select
                          value={q.kind}
                          onValueChange={(kind) =>
                            dispatch({
                              type: "updateQuestion",
                              index: i,
                              patch: { kind: kind as FormQuestionKind },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {QUESTION_KINDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {QUESTION_KIND_LABEL[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Ask for" error={errors[`${p}serviceName`]}>
                        <Select
                          value={q.serviceName ?? ALL_SERVICES}
                          onValueChange={(value) =>
                            dispatch({
                              type: "updateQuestion",
                              index: i,
                              patch: { serviceName: value === ALL_SERVICES ? null : value },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ALL_SERVICES}>All services</SelectItem>
                            {setup.services
                              .filter((s) => s.name.trim())
                              .map((s) => (
                                <SelectItem key={s.name} value={s.name}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            {q.serviceName && !setup.services.some((s) => s.name === q.serviceName) && (
                              <SelectItem value={q.serviceName}>{q.serviceName}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    {q.kind === "select" && (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium">Choices</p>
                        <ul className="flex flex-col gap-2">
                          {q.options.map((o, j) => (
                            <li key={j} className="flex items-center gap-2">
                              <Input
                                size="sm"
                                aria-label={`Choice ${j + 1}`}
                                aria-invalid={(!o.trim() && !!errors[`${p}options`]) || undefined}
                                aria-describedby={
                                  errors[`${p}options`] ? `question-${i}-choices-error` : undefined
                                }
                                value={o}
                                onChange={(e) =>
                                  dispatch({
                                    type: "updateQuestionOption",
                                    index: i,
                                    optionIndex: j,
                                    value: e.target.value,
                                  })
                                }
                              />
                              <IconButton
                                label={`Remove choice ${o || j + 1}`}
                                size="sm"
                                onClick={() =>
                                  dispatch({ type: "removeQuestionOption", index: i, optionIndex: j })
                                }
                              >
                                <X />
                              </IconButton>
                            </li>
                          ))}
                        </ul>
                        {errors[`${p}options`] && (
                          <p
                            id={`question-${i}-choices-error`}
                            role="alert"
                            className="text-xs font-medium text-danger-soft-foreground"
                          >
                            {errors[`${p}options`]}
                          </p>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="self-start"
                          onClick={() => dispatch({ type: "addQuestionOption", index: i })}
                        >
                          <Plus />
                          Add choice
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-col gap-3">
                      <Field
                        orientation="horizontal"
                        label="Required"
                        help="Customers must answer before booking."
                      >
                        <Switch
                          checked={q.required}
                          onCheckedChange={(required) =>
                            dispatch({ type: "updateQuestion", index: i, patch: { required } })
                          }
                        />
                      </Field>
                      <Field
                        orientation="horizontal"
                        label="Sensitive"
                        help="For health or personal details. Visibility is restricted and answers are never shared with AI."
                      >
                        <Switch
                          checked={q.sensitive}
                          onCheckedChange={(sensitive) =>
                            dispatch({ type: "updateQuestion", index: i, patch: { sensitive } })
                          }
                        />
                      </Field>
                    </div>
                    <div className="flex justify-end border-t border-border-subtle pt-3">
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        onClick={() => {
                          onExpand(null);
                          dispatch({ type: "removeQuestion", index: i });
                        }}
                      >
                        <Trash2 />
                        Remove question
                      </Button>
                    </div>
                  </div>
                </ItemRow>
              );
            })}
          </ul>
        )}
        <Button
          size="sm"
          className="self-start"
          onClick={() => {
            onExpand(questions.length);
            dispatch({ type: "addQuestion" });
          }}
        >
          <Plus />
          Add question
        </Button>
      </div>
    </SectionCard>
  );
}
