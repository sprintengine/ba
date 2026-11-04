"use client";

import { Box, DoorOpen, Plus, Trash2, UserRound, Users } from "lucide-react";
import type { BusinessSetup, ResourceKind } from "@/lib/api/types";
import { RESOURCE_KIND_LABEL, RESOURCE_KINDS } from "@/lib/catalog/resources";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NumberInput } from "@/components/ui/number-input";
import { ItemRow, SectionCard } from "./section-card";
import type { SetupAction } from "@/lib/onboarding/actions";
import { summarizeHours } from "@/lib/onboarding/hours";
import { nextResource } from "@/lib/onboarding/reducers/resources";
import type { SetupErrors } from "@/lib/onboarding/types";
import { WeeklyHoursEditor } from "./weekly-hours-editor";

const KIND_ICON: Record<ResourceKind, typeof UserRound> = {
  person: UserRound,
  space: DoorOpen,
  equipment: Box,
};

export function ResourcesSection({
  setup,
  errors,
  expandedKey,
  onExpand,
  dispatch,
}: {
  setup: BusinessSetup;
  errors: SetupErrors;
  expandedKey: string | null;
  onExpand: (key: string | null) => void;
  dispatch: (action: SetupAction) => void;
}) {
  const v = setup.vocabulary;
  const problems = Object.keys(errors).filter((k) => k.startsWith("resources")).length;
  const count = setup.resources.length;

  return (
    <SectionCard
      id="section-resources"
      icon={<Users />}
      title={v.resources}
      summary={
        count === 0
          ? `Who or what customers book: people, rooms or equipment.`
          : `${resourceCounts(setup)} with their own weekly hours.`
      }
      problems={problems}
    >
      <div className="flex flex-col gap-3">
        {count === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Add the people, rooms or equipment that customers book time with.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {setup.resources.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              const prefix = `resources[${i}].`;
              const invalid = Object.keys(errors).some((k) => k.startsWith(prefix));
              return (
                <ItemRow
                  key={r.key}
                  id={`item-resources-${i}`}
                  expanded={expandedKey === r.key}
                  onToggle={() => onExpand(expandedKey === r.key ? null : r.key)}
                  invalid={invalid}
                  leading={
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon aria-hidden className="size-3.5" />
                    </span>
                  }
                  title={r.name.trim() || `Unnamed ${v.resource.toLowerCase()}`}
                  meta={summarizeHours(r.weeklyHours)}
                  aside={r.capacity > 1 ? `×${r.capacity}` : undefined}
                >
                  <div className="flex flex-col gap-5">
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                      <Field label="Name" required error={errors[`${prefix}name`]}>
                        <Input
                          value={r.name}
                          maxLength={100}
                          onChange={(e) =>
                            dispatch({ type: "updateResource", key: r.key, patch: { name: e.target.value } })
                          }
                        />
                      </Field>
                      <Field label="Capacity" error={errors[`${prefix}capacity`]} help="At once">
                        <NumberInput
                          value={r.capacity}
                          onValueChange={(capacity) =>
                            dispatch({
                              type: "updateResource",
                              key: r.key,
                              patch: { capacity: capacity ?? 0 },
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Kind" error={errors[`${prefix}kind`]}>
                      <SegmentedControl
                        aria-label="Kind"
                        size="sm"
                        className="self-start"
                        value={r.kind}
                        onValueChange={(kind) =>
                          dispatch({ type: "updateResource", key: r.key, patch: { kind } })
                        }
                        options={RESOURCE_KINDS.map((k) => {
                          const KindIcon = KIND_ICON[k];
                          return {
                            value: k,
                            label: RESOURCE_KIND_LABEL[k],
                            icon: <KindIcon className="size-3.5" />,
                          };
                        })}
                      />
                    </Field>
                    <WeeklyHoursEditor
                      resource={r}
                      resourceIndex={i}
                      groups={setup.customerGroups}
                      errors={errors}
                      otherResourceCount={count - 1}
                      resourcesNoun={v.resources}
                      dispatch={dispatch}
                    />
                    <div className="flex justify-end border-t border-border-subtle pt-3">
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        onClick={() => {
                          onExpand(null);
                          dispatch({ type: "removeResource", key: r.key });
                        }}
                      >
                        <Trash2 />
                        Remove {r.name.trim() || v.resource.toLowerCase()}
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
            onExpand(nextResource(setup).key);
            dispatch({ type: "addResource" });
          }}
        >
          <Plus />
          Add {v.resource.toLowerCase()}
        </Button>
      </div>
    </SectionCard>
  );
}

const KIND_NOUN: Record<ResourceKind, [string, string]> = {
  person: ["person", "people"],
  space: ["room", "rooms"],
  equipment: ["piece of equipment", "pieces of equipment"],
};

/**
 * "4 bays", or "2 therapists and 2 rooms" when the kinds are mixed. The business's own word goes to the first
 * resource's kind (templates list the main kind first), so a physio's rooms aren't counted as therapists.
 */
function resourceCounts(setup: BusinessSetup): string {
  const v = setup.vocabulary;
  const counts = new Map<ResourceKind, number>();
  for (const r of setup.resources) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const main = setup.resources[0]?.kind;
  const parts = [...counts].map(([kind, n]) => {
    const [one, many] =
      kind === main || counts.size === 1
        ? [v.resource.toLowerCase(), v.resources.toLowerCase()]
        : KIND_NOUN[kind];
    return `${n} ${n === 1 ? one : many}`;
  });
  const last = parts.pop() ?? "";
  return parts.length ? `${parts.join(", ")} and ${last}` : last;
}
