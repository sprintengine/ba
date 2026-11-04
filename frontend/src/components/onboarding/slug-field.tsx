"use client";

import { Check, CircleAlert, RotateCcw } from "lucide-react";
import { useSlugAvailability } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Field, useFieldControlProps } from "@/components/ui/field";
import { controlStyles } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { slugProblem } from "@/lib/slug";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { publicHost } from "@/lib/oauth/app-url";

/** The host booking page addresses are shown on. */
export const PUBLIC_HOST = publicHost();

export type SlugCheck =
  | { status: "empty" | "invalid" | "checking" | "available" | "unknown" }
  | { status: "taken"; suggestion: string | null };

/** Debounced live availability for a slug; skips the request when the format is already invalid. */
export function useSlugCheck(slug: string): SlugCheck {
  const debounced = useDebouncedValue(slug, 300);
  const localProblem = slug ? slugProblem(slug) : null;
  const canCheck = !!debounced && !slugProblem(debounced);
  const query = useSlugAvailability(canCheck ? debounced : "", { retry: false, staleTime: 30_000 });

  if (!slug) return { status: "empty" };
  if (localProblem) return { status: "invalid" };
  if (debounced !== slug || query.isFetching) return { status: "checking" };
  if (query.isError) return { status: "unknown" };
  if (!query.data) return { status: "checking" };
  return query.data.available
    ? { status: "available" }
    : { status: "taken", suggestion: query.data.suggestion };
}

export function SlugField({
  slug,
  check,
  edited,
  error,
  onChange,
  onReset,
}: {
  slug: string;
  check: SlugCheck;
  edited: boolean;
  error?: string;
  onChange: (slug: string) => void;
  onReset: () => void;
}) {
  const trailing =
    check.status === "checking" ? (
      <Spinner label="Checking availability" className="size-3.5 text-subtle-foreground" />
    ) : check.status === "available" && !error ? (
      <Check aria-hidden className="size-4 text-success" />
    ) : check.status === "taken" ? (
      <CircleAlert aria-hidden className="size-4 text-danger" />
    ) : null;

  const takenMessage = check.status === "taken" ? "That address is already taken" : undefined;

  const help =
    check.status === "available" ? (
      <span className="text-success-soft-foreground">
        Available. Your booking page will be at {PUBLIC_HOST}/{slug}
      </span>
    ) : check.status === "unknown" ? (
      "We couldn't check availability right now. We'll confirm when you create."
    ) : (
      `Your booking page will be at ${PUBLIC_HOST}/${slug || "…"}`
    );

  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Booking page address"
        required
        error={error ?? takenMessage}
        help={help}
        labelAction={
          edited ? (
            <Button variant="link" size="xs" className="text-xs" onClick={onReset}>
              <RotateCcw className="size-3" />
              Match business name
            </Button>
          ) : null
        }
      >
        <SlugInput value={slug} onChange={onChange} trailing={trailing} />
      </Field>
      {check.status === "taken" && check.suggestion && (
        <div className="flex animate-fade-in flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Try</span>
          <Button size="xs" variant="soft" onClick={() => onChange(check.suggestion!)}>
            {PUBLIC_HOST}/{check.suggestion}
          </Button>
        </div>
      )}
    </div>
  );
}

/** "bookanything.ie/" prefix + input in one control (the prefix is too wide for Input's icon slot). */
function SlugInput({
  value,
  onChange,
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  trailing: React.ReactNode;
}) {
  const props = useFieldControlProps<React.ComponentProps<"input">>({});
  return (
    <div
      className={cn(
        controlStyles,
        "flex h-9 items-center overflow-hidden focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20",
        "has-[input[aria-invalid=true]]:border-danger",
      )}
    >
      <span aria-hidden className="shrink-0 pl-3 text-base text-subtle-foreground select-none sm:text-sm">
        {PUBLIC_HOST}/
      </span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent pr-2 text-base text-foreground outline-none sm:text-sm"
      />
      {trailing && <span className="flex shrink-0 items-center pr-3">{trailing}</span>}
    </div>
  );
}
