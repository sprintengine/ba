"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NumberInput } from "@/components/ui/number-input";
import { firstError, RowError, SubList, type EditorProps } from "./service-sublist";

/** Options a customer picks one of (car size, lesson length), each with its own duration and price. */
export function OptionsEditor({ setup, service: s, index, errors, dispatch }: EditorProps) {
  const p = `services[${index}].options`;
  return (
    <SubList
      title="Options"
      description="Customers pick one, e.g. car size or lesson length. Each sets its own duration and price."
      action={
        <Button size="xs" onClick={() => dispatch({ type: "addOption", serviceIndex: index })}>
          <Plus />
          Add
        </Button>
      }
    >
      {s.options.length > 0 && (
        <ul className="flex flex-col gap-2">
          {s.options.map((o, j) => {
            const rowError = firstError(errors, `${p}[${j}].`);
            const errorId = `svc-${index}-option-${j}-error`;
            const describedBy = rowError ? errorId : undefined;
            return (
              <li key={j} className="flex flex-col gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_auto]">
                  <Input
                    size="sm"
                    aria-label={`Option ${j + 1} name`}
                    aria-invalid={!!errors[`${p}[${j}].name`] || undefined}
                    aria-describedby={describedBy}
                    value={o.name}
                    maxLength={120}
                    placeholder="Option name"
                    onChange={(e) =>
                      dispatch({
                        type: "updateOption",
                        serviceIndex: index,
                        index: j,
                        patch: { name: e.target.value },
                      })
                    }
                    className="col-span-1"
                  />
                  <IconButton
                    label={`Remove option ${o.name || j + 1}`}
                    size="sm"
                    className="sm:order-last"
                    onClick={() => dispatch({ type: "removeOption", serviceIndex: index, index: j })}
                  >
                    <X />
                  </IconButton>
                  <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
                    <NumberInput
                      size="sm"
                      aria-label={`Option ${j + 1} duration in minutes`}
                      aria-invalid={!!errors[`${p}[${j}].durationMinutes`] || undefined}
                      aria-describedby={describedBy}
                      unit="min"
                      value={o.durationMinutes}
                      onValueChange={(durationMinutes) =>
                        dispatch({
                          type: "updateOption",
                          serviceIndex: index,
                          index: j,
                          patch: { durationMinutes: durationMinutes ?? 0 },
                        })
                      }
                    />
                    <MoneyInput
                      size="sm"
                      aria-label={`Option ${j + 1} price`}
                      aria-invalid={!!errors[`${p}[${j}].priceCents`] || undefined}
                      aria-describedby={describedBy}
                      currency={setup.currency}
                      locale={setup.locale}
                      value={o.priceCents}
                      onValueChange={(c) =>
                        dispatch({
                          type: "updateOption",
                          serviceIndex: index,
                          index: j,
                          patch: { priceCents: c ?? 0 },
                        })
                      }
                    />
                  </div>
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

/** Optional extras with extra minutes and a price. */
export function AddonsEditor({ setup, service: s, index, errors, dispatch }: EditorProps) {
  const p = `services[${index}].addons`;
  return (
    <SubList
      title="Add-ons"
      description="Optional extras customers can add, like a wax or an extra 15 minutes."
      action={
        <Button size="xs" onClick={() => dispatch({ type: "addAddon", serviceIndex: index })}>
          <Plus />
          Add
        </Button>
      }
    >
      {s.addons.length > 0 && (
        <ul className="flex flex-col gap-2">
          {s.addons.map((a, j) => {
            const rowError = firstError(errors, `${p}[${j}].`);
            const errorId = `svc-${index}-addon-${j}-error`;
            const describedBy = rowError ? errorId : undefined;
            return (
              <li key={j} className="flex flex-col gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_auto]">
                  <Input
                    size="sm"
                    aria-label={`Add-on ${j + 1} name`}
                    aria-invalid={!!errors[`${p}[${j}].name`] || undefined}
                    aria-describedby={describedBy}
                    value={a.name}
                    maxLength={120}
                    placeholder="Add-on name"
                    onChange={(e) =>
                      dispatch({
                        type: "updateAddon",
                        serviceIndex: index,
                        index: j,
                        patch: { name: e.target.value },
                      })
                    }
                  />
                  <IconButton
                    label={`Remove add-on ${a.name || j + 1}`}
                    size="sm"
                    className="sm:order-last"
                    onClick={() => dispatch({ type: "removeAddon", serviceIndex: index, index: j })}
                  >
                    <X />
                  </IconButton>
                  <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
                    <NumberInput
                      size="sm"
                      aria-label={`Add-on ${j + 1} extra minutes`}
                      aria-invalid={!!errors[`${p}[${j}].extraMinutes`] || undefined}
                      aria-describedby={describedBy}
                      unit="+min"
                      value={a.extraMinutes}
                      onValueChange={(extraMinutes) =>
                        dispatch({
                          type: "updateAddon",
                          serviceIndex: index,
                          index: j,
                          patch: { extraMinutes: extraMinutes ?? 0 },
                        })
                      }
                    />
                    <MoneyInput
                      size="sm"
                      aria-label={`Add-on ${j + 1} price`}
                      aria-invalid={!!errors[`${p}[${j}].priceCents`] || undefined}
                      aria-describedby={describedBy}
                      currency={setup.currency}
                      locale={setup.locale}
                      value={a.priceCents}
                      onValueChange={(c) =>
                        dispatch({
                          type: "updateAddon",
                          serviceIndex: index,
                          index: j,
                          patch: { priceCents: c ?? 0 },
                        })
                      }
                    />
                  </div>
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
