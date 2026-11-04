"use client";

import { useMemo, useState } from "react";
import { Bell, ChevronDown, Store } from "lucide-react";
import type { BusinessSetup, Vocabulary } from "@/lib/api/types";
import { CURRENCIES } from "@/lib/catalog/currencies";
import { ColorPicker } from "@/components/ui/color-picker";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { browserTimeZone, COMMON_TIME_ZONES, supportedTimeZones, timeZoneOptions } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SetupAction } from "@/lib/onboarding/actions";
import type { SetupErrors } from "@/lib/onboarding/types";
import { SectionCard } from "./section-card";
import { SlugField, type SlugCheck } from "./slug-field";

function useTimeZoneOptions(current: string): ComboboxOption[] {
  return useMemo(
    () =>
      timeZoneOptions(
        [current, browserTimeZone(), ...COMMON_TIME_ZONES, ...supportedTimeZones()].filter(
          (z) => !!z,
        ) as string[],
      ),
    [current],
  );
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export function BusinessSection({
  setup,
  errors,
  slugEdited,
  slugCheck,
  dispatch,
}: {
  setup: BusinessSetup;
  errors: SetupErrors;
  slugEdited: boolean;
  slugCheck: SlugCheck;
  dispatch: (action: SetupAction) => void;
}) {
  const zoneOptions = useTimeZoneOptions(setup.timezone);
  const browser = browserTimeZone();
  const [wordingOpen, setWordingOpen] = useState(() =>
    Object.keys(errors).some((k) => k.startsWith("vocabulary.")),
  );
  const vocabErrors = Object.keys(errors).filter((k) => k.startsWith("vocabulary.")).length;
  const problems =
    ["name", "slug", "timezone", "currency", "description", "branding.primaryColor"].filter((k) => errors[k])
      .length + vocabErrors;
  const currencyKnown = CURRENCIES.some((c) => c.code === setup.currency);
  const v = setup.vocabulary;

  return (
    <SectionCard
      id="section-business"
      icon={<Store />}
      title="Your business"
      summary="The name, address and wording customers see."
      problems={problems}
    >
      <div className="grid grid-cols-1 gap-5">
        <Field label="Business name" required error={errors.name}>
          <Input
            value={setup.name}
            onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
            placeholder="Lumen Physiotherapy"
            autoComplete="organization"
            maxLength={100}
          />
        </Field>

        <SlugField
          slug={setup.slug ?? ""}
          check={slugCheck}
          edited={slugEdited}
          error={errors.slug}
          onChange={(slug) => dispatch({ type: "setSlug", slug })}
          onReset={() => dispatch({ type: "resetSlug" })}
        />

        <Field
          label="Short description"
          optional
          error={errors.description}
          help="Shown at the top of your booking page."
        >
          <Textarea
            value={setup.description ?? ""}
            onChange={(e) => dispatch({ type: "updateBusiness", patch: { description: e.target.value } })}
            rows={2}
            className="min-h-16"
            maxLength={2000}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Timezone"
            required
            error={errors.timezone}
            help={
              browser && browser !== setup.timezone ? (
                <span>
                  Your device uses {browser.replace(/_/g, " ")}.{" "}
                  <Button
                    variant="link"
                    size="xs"
                    className="text-xs"
                    onClick={() => dispatch({ type: "updateBusiness", patch: { timezone: browser } })}
                  >
                    Use it
                  </Button>
                </span>
              ) : (
                "Opening hours and bookings use this timezone."
              )
            }
          >
            <Combobox
              options={zoneOptions}
              value={setup.timezone}
              onValueChange={(tz) => tz && dispatch({ type: "updateBusiness", patch: { timezone: tz } })}
              placeholder="Choose a timezone"
              searchPlaceholder="Search cities…"
            />
          </Field>
          <Field
            label="Currency"
            required
            error={errors.currency}
            help="Prices and payments use this currency."
          >
            <Select
              value={setup.currency}
              onValueChange={(currency) => dispatch({ type: "updateBusiness", patch: { currency } })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a currency" />
              </SelectTrigger>
              <SelectContent>
                {!currencyKnown && setup.currency && (
                  <SelectItem value={setup.currency}>{setup.currency}</SelectItem>
                )}
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="tnum font-medium">{c.code}</span>{" "}
                    <span className="text-muted-foreground">· {c.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field
          label="Brand colour"
          error={errors["branding.primaryColor"]}
          help="Used for buttons and highlights on your booking page."
        >
          <ColorPicker
            value={setup.branding.primaryColor}
            onValueChange={(color) => dispatch({ type: "setBrandColor", color })}
          />
        </Field>

        <div className="rounded-lg border border-border-subtle">
          <button
            type="button"
            aria-expanded={wordingOpen}
            aria-controls="wording-editor"
            onClick={() => setWordingOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-sm font-medium">
                Wording
                {vocabErrors > 0 && (
                  <span className="text-xs font-medium text-danger-soft-foreground">· needs attention</span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {v.resources} · {v.customers} · {v.bookings}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-subtle-foreground transition-transform",
                wordingOpen && "rotate-180",
              )}
            />
          </button>
          {wordingOpen && (
            <div
              id="wording-editor"
              className="flex animate-fade-in flex-col gap-4 border-t border-border-subtle px-3 pt-4 pb-3"
            >
              <p className="text-sm text-muted-foreground">
                Use the words your customers use. A physio sees <em>patients</em> and <em>appointments</em>; a
                car wash has <em>bays</em>.
              </p>
              <div className="grid gap-x-3 gap-y-4 sm:grid-cols-3">
                {(
                  [
                    ["resource", "resources", "What people book"],
                    ["customer", "customers", "Who books"],
                    ["booking", "bookings", "What a booking is called"],
                  ] as [keyof Vocabulary, keyof Vocabulary, string][]
                ).map(([one, many, label]) => (
                  <fieldset key={one} className="flex flex-col gap-2">
                    <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</legend>
                    <Field error={errors[`vocabulary.${one}`]}>
                      <Input
                        size="sm"
                        aria-label={`${label}, singular`}
                        value={v[one]}
                        onChange={(e) =>
                          dispatch({ type: "setVocabulary", patch: { [one]: e.target.value } })
                        }
                        maxLength={40}
                      />
                    </Field>
                    <Field error={errors[`vocabulary.${many}`]}>
                      <Input
                        size="sm"
                        aria-label={`${label}, plural`}
                        value={v[many]}
                        onChange={(e) =>
                          dispatch({ type: "setVocabulary", patch: { [many]: e.target.value } })
                        }
                        maxLength={40}
                      />
                    </Field>
                  </fieldset>
                ))}
              </div>
              <VocabularyExample setup={setup} />
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/** A live example of the wording, shaped like a dashboard notification. */
function VocabularyExample({ setup }: { setup: BusinessSetup }) {
  const v = setup.vocabulary;
  const lower = (s: string) => s.trim().toLowerCase() || "…";
  const resourceName = setup.resources[0]?.name.trim() || `your first ${lower(v.resource)}`;
  const serviceName = setup.services[0]?.name.trim();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Example</p>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-sunken/60 p-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-soft-foreground">
          <Bell aria-hidden className="size-3.5" />
        </span>
        <p className="text-sm text-pretty">
          <span className="font-medium">New {lower(v.booking)} from Alex Morgan</span>
          <span className="text-muted-foreground">
            {" "}
            — {article(lower(v.customer))} {lower(v.customer)} booked{" "}
            {serviceName ? <>{serviceName} </> : null}with {resourceName}. You have 8 {lower(v.bookings)}{" "}
            today across {Math.max(setup.resources.length, 1)}{" "}
            {setup.resources.length === 1 ? lower(v.resource) : lower(v.resources)}.
          </span>
        </p>
      </div>
    </div>
  );
}
