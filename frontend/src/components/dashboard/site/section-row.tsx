"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  Copy,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type { SiteSection } from "@/lib/api/types";
import { sectionDef, withDef } from "@/lib/site/sections";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { editorFor } from "./section-editors";
import { useEditor } from "./use-site-editor";

export function SectionRow({
  section,
  index,
  total,
  expanded,
  onToggleExpanded,
}: {
  section: SiteSection;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { dispatch, issues, revision } = useEditor();
  const drag = useDragControls();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const def = sectionDef(section.type);
  const editor = editorFor(section.type);
  const problems = Object.keys(issues.sections[section.id] ?? {}).length;
  const summary = withDef(section, (d, s) => editorFor(d.type).summary(s));
  const formId = `section-form-${section.id}`;

  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={drag}
      data-section-row={section.id}
      className={cn(
        "rounded-xl border bg-surface transition-colors",
        expanded ? "border-border-strong shadow-sm" : "border-border",
        !section.enabled && "bg-surface-sunken",
      )}
    >
      <div className="flex items-center gap-1.5 py-2 pr-2 pl-1">
        <button
          type="button"
          aria-label={`Drag to reorder ${def.label}`}
          onPointerDown={(e) => drag.start(e)}
          className="flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-subtle-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={formId}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 text-left"
        >
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <editor.icon className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {def.label}
              {!section.enabled && <span className="text-xs font-normal text-muted-foreground">Hidden</span>}
              {problems > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs font-normal text-danger">
                  <CircleAlert className="size-3.5" aria-hidden /> {problems} to fix
                </span>
              )}
            </span>
            {summary && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <Switch
          size="sm"
          checked={section.enabled}
          onCheckedChange={(on) => dispatch({ type: "toggle", id: section.id, enabled: on })}
          aria-label={section.enabled ? `Hide ${def.label}` : `Show ${def.label}`}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`${def.label} options`} size="sm" tooltip={false}>
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={index === 0}
              onSelect={() => dispatch({ type: "move", id: section.id, to: index - 1 })}
            >
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === total - 1}
              onSelect={() => dispatch({ type: "move", id: section.id, to: index + 1 })}
            >
              <ArrowDown /> Move down
            </DropdownMenuItem>
            {!def.single && (
              <DropdownMenuItem onSelect={() => dispatch({ type: "duplicate", id: section.id })}>
                <Copy /> Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setConfirmRemove(true)}>
              <Trash2 /> Remove section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && (
        <div id={formId} className="border-t border-border-subtle px-4 pt-4 pb-5">
          <p className="mb-4 text-xs text-muted-foreground">{def.description}</p>
          {withDef(section, (d, s) => {
            const Form = editorFor(d.type).Form;
            return <Form key={`${s.id}-${revision}`} section={s} />;
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove the ${def.label.toLowerCase()} section?`}
        description="Its content is removed from the draft. You can restore it from History until you publish over it."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          dispatch({ type: "remove", id: section.id });
        }}
      />
    </Reorder.Item>
  );
}
