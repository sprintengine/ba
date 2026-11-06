"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Trash2, Users } from "lucide-react";
import type { Resource } from "@/lib/api/types";
import {
  peopleFirst,
  resourceChoiceLabel,
  resourceChoiceParam,
  type ResourceChoice,
} from "@/lib/dashboard/calendar-resources";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchInput } from "@/components/ui/search-input";
import { ResourceKindIcon } from "../common";

/** A saved set of resources, kept on this device. */
type SavedGroup = { name: string; ids: string[] };

const groupsKey = (businessId: string) => `bookanything.calendarGroups.${businessId}`;

function useSavedGroups(businessId: string) {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(groupsKey(businessId)) ?? "[]");
      // Restore saved groups after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroups(Array.isArray(saved) ? (saved as SavedGroup[]) : []);
    } catch {
      setGroups([]);
    }
  }, [businessId]);
  const save = (next: SavedGroup[]) => {
    setGroups(next);
    window.localStorage.setItem(groupsKey(businessId), JSON.stringify(next));
  };
  return { groups, save };
}

/** Lists are searchable once they stop fitting at a glance. */
const SEARCH_FROM = 8;

/**
 * The calendar's one control for what shows: all people, all spaces, both, a saved group or any mix, searchable. Its
 * label always says what is showing.
 */
export function CalendarResourcePicker({
  businessId,
  resources,
  choice,
  shown,
  onChoose,
}: {
  businessId: string;
  resources: Resource[];
  choice: ResourceChoice;
  /** The resources showing now. */
  shown: Resource[];
  onChoose: (param: string | null) => void;
}) {
  const { v } = useVocabulary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const { groups, save } = useSavedGroups(businessId);
  const ordered = useMemo(() => peopleFirst(resources), [resources]);
  const label = resourceChoiceLabel(choice, shown, resources, v("resources"));
  const hasPeople = resources.some((r) => r.kind === "person");
  const hasOthers = resources.some((r) => r.kind !== "person");
  const both = hasPeople && hasOthers;

  const choose = (next: ResourceChoice) => onChoose(resourceChoiceParam(next));
  const toggle = (id: string) => {
    // Starting from what is showing, so unticking one person from "All people" keeps the rest.
    const current = shown.map((r) => r.id);
    const ids = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    choose({ type: "ids", ids });
  };
  const needle = query.trim().toLowerCase();
  const matches = ordered.filter((r) => r.name.toLowerCase().includes(needle));
  const custom = choice.type === "ids" && choice.ids.length > 1;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setNaming(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Filter by ${v("resource")}: ${label}`}
          className="w-full min-w-0 justify-start max-sm:flex-1"
        >
          <Users aria-hidden />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown aria-hidden className="ml-auto text-subtle-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={`Filter by ${v("resource")}`} className="w-72 p-1.5">
        {resources.length >= SEARCH_FROM && (
          <div className="px-1 pt-1 pb-1.5">
            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Find by name"
              aria-label="Find by name"
            />
          </div>
        )}
        <div className="flex max-h-[min(24rem,60dvh)] scrollbar-thin flex-col overflow-y-auto">
          {needle === "" && (
            <>
              {both ? (
                <>
                  <Preset active={choice.type === "people"} onClick={() => choose({ type: "people" })}>
                    All people
                  </Preset>
                  <Preset active={choice.type === "spaces"} onClick={() => choose({ type: "spaces" })}>
                    All spaces
                  </Preset>
                  <Preset
                    active={choice.type === "everything"}
                    onClick={() => choose({ type: "everything" })}
                  >
                    All people and spaces
                  </Preset>
                </>
              ) : (
                <Preset active={choice.type !== "ids"} onClick={() => choose({ type: "people" })}>
                  All {v("resources")}
                </Preset>
              )}
              {groups.map((g) => {
                const active =
                  choice.type === "ids" &&
                  choice.ids.length === g.ids.length &&
                  g.ids.every((id) => choice.ids.includes(id));
                return (
                  <div key={g.name} className="group/row flex items-center">
                    <Preset active={active} onClick={() => choose({ type: "ids", ids: g.ids })}>
                      {g.name}
                    </Preset>
                    <button
                      type="button"
                      aria-label={`Delete group ${g.name}`}
                      onClick={() => save(groups.filter((x) => x !== g))}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:size-11 [&_svg]:size-3.5"
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </div>
                );
              })}
              <div className="my-1 border-t border-border-subtle" />
            </>
          )}
          {matches.map((r) => {
            const checked = shown.some((x) => x.id === r.id);
            return (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent pointer-coarse:min-h-11"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(r.id)} />
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded text-white"
                  style={{ backgroundColor: r.color }}
                >
                  <ResourceKindIcon kind={r.kind} className="size-3" />
                </span>
                <span className="min-w-0 truncate">{r.name}</span>
              </label>
            );
          })}
          {matches.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nothing matches that name.</p>
          )}
        </div>
        {custom &&
          (naming ? (
            <form
              className="flex items-center gap-1.5 border-t border-border-subtle px-1 pt-2 pb-1"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = name.trim();
                if (!trimmed) return;
                save([...groups.filter((g) => g.name !== trimmed), { name: trimmed, ids: choice.ids }]);
                setName("");
                setNaming(false);
              }}
            >
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                aria-label="Group name"
                wrapperClassName="min-w-0 flex-1"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={name.trim() === ""}>
                Save
              </Button>
            </form>
          ) : (
            <div className="border-t border-border-subtle px-1 pt-1.5">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setNaming(true)}>
                Save as a group
              </Button>
            </div>
          ))}
      </PopoverContent>
    </Popover>
  );
}

function Preset({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent pointer-coarse:min-h-11",
        active && "font-medium",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <Check aria-hidden className="size-4 shrink-0" />}
    </button>
  );
}
