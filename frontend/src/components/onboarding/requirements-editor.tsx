"use client";

import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NumberInput } from "@/components/ui/number-input";
import { firstError, RowError, SubList, type EditorProps } from "./service-sublist";

/** The resource pools a booking reserves from ("one bay and one valeter"). */
export function RequirementsEditor({ setup, service: s, index, errors, dispatch }: EditorProps) {
  const p = `services[${index}].requirements`;
  const v = setup.vocabulary;
  return (
    <SubList
      title="Who or what it needs"
      description={`Each booking reserves one ${v.resource.toLowerCase()} from every pool below.`}
      action={
        setup.resources.length > 0 ? (
          <Button size="xs" onClick={() => dispatch({ type: "addRequirement", serviceIndex: index })}>
            <Plus />
            Add
          </Button>
        ) : undefined
      }
    >
      {setup.resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add {v.resources.toLowerCase()} first, then choose which ones this service uses.
        </p>
      ) : s.requirements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          Not linked to any {v.resources.toLowerCase()} yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {s.requirements.map((r, j) => {
            const rp = `${p}[${j}].`;
            const rowError = firstError(errors, rp);
            const errorId = `svc-${index}-requirement-${j}-error`;
            const describedBy = rowError ? errorId : undefined;
            return (
              <li key={j} className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3">
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    aria-label={`Requirement ${j + 1} label`}
                    aria-invalid={!!errors[`${rp}label`] || undefined}
                    aria-describedby={describedBy}
                    value={r.label}
                    maxLength={100}
                    onChange={(e) =>
                      dispatch({
                        type: "updateRequirement",
                        serviceIndex: index,
                        index: j,
                        patch: { label: e.target.value },
                      })
                    }
                    className="max-w-56"
                  />
                  <span className="flex-1" />
                  <IconButton
                    label={`Remove requirement ${r.label || j + 1}`}
                    size="sm"
                    onClick={() => dispatch({ type: "removeRequirement", serviceIndex: index, index: j })}
                  >
                    <X />
                  </IconButton>
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label={`${r.label || "Requirement"}: choose from`}
                  aria-describedby={describedBy}
                >
                  {setup.resources.map((res) => {
                    const on = r.resourceKeys.includes(res.key);
                    return (
                      <button
                        key={res.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          dispatch({
                            type: "toggleRequirementResource",
                            serviceIndex: index,
                            index: j,
                            resourceKey: res.key,
                          })
                        }
                        className={cn(
                          "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          on
                            ? "border-brand-border bg-brand-soft text-brand-soft-foreground"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground dark:bg-surface-raised",
                        )}
                      >
                        {res.name || "Unnamed"}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      size="sm"
                      checked={r.customerSelectable}
                      onCheckedChange={(customerSelectable) =>
                        dispatch({
                          type: "updateRequirement",
                          serviceIndex: index,
                          index: j,
                          patch: { customerSelectable },
                        })
                      }
                    />
                    Customer chooses
                  </label>
                  {r.resourceKeys.length > 1 && (
                    <label className="flex items-center gap-2 text-sm">
                      Needs
                      <NumberInput
                        size="sm"
                        className="w-16"
                        aria-invalid={!!errors[`${rp}quantity`] || undefined}
                        aria-describedby={describedBy}
                        value={r.quantity}
                        onValueChange={(quantity) =>
                          dispatch({
                            type: "updateRequirement",
                            serviceIndex: index,
                            index: j,
                            patch: { quantity: quantity ?? 0 },
                          })
                        }
                      />
                      at once
                    </label>
                  )}
                  {r.customerSelectable && <Badge tone="brand">Shown as a choice when booking</Badge>}
                </div>
                {rowError && <RowError id={errorId}>{rowError}</RowError>}
              </li>
            );
          })}
        </ul>
      )}
      {errors[p] && <RowError>{errors[p]}</RowError>}
    </SubList>
  );
}
