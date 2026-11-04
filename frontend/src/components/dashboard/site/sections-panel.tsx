"use client";

import { Reorder } from "motion/react";
import { Plus } from "lucide-react";
import type { SiteSection, SiteSectionType } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { newSectionId } from "@/lib/site/plan";
import { addBlocker } from "@/lib/site/plan-edit";
import { LIMITS } from "@/lib/site/schema";
import { SECTION_TYPES, sectionDef } from "@/lib/site/sections";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelSection } from "./panel-section";
import { editorFor } from "./section-editors";
import { SectionRow } from "./section-row";
import { useEditor } from "./use-site-editor";

/** The ordered section list: drag or use the menu to reorder, toggle, edit, add and remove. */
export function SectionsPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { plan, dispatch } = useEditor();
  const reorder = (next: SiteSection[]) => {
    // Reorder reports the whole list; apply it as moves so the plan stays the single source.
    next.forEach((s, index) => {
      if (plan.sections[index]?.id !== s.id) dispatch({ type: "move", id: s.id, to: index });
    });
  };
  return (
    <PanelSection
      title="Sections"
      description="Top to bottom, as they appear on your site. Hidden sections keep their content."
      actions={<AddSectionMenu onAdded={onSelect} />}
    >
      <Reorder.Group
        axis="y"
        values={plan.sections}
        onReorder={reorder}
        className="flex flex-col gap-2"
        aria-label="Sections"
      >
        {plan.sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            total={plan.sections.length}
            expanded={selectedId === section.id}
            onToggleExpanded={() => onSelect(selectedId === section.id ? null : section.id)}
          />
        ))}
      </Reorder.Group>
      <p className="tnum text-xs text-muted-foreground">
        {plan.sections.length}/{LIMITS.sections} sections
      </p>
    </PanelSection>
  );
}

function AddSectionMenu({ onAdded }: { onAdded: (id: string) => void }) {
  const business = useCurrentBusiness();
  const { plan, dispatch } = useEditor();
  const add = (type: SiteSectionType) => {
    const id = newSectionId(type, plan.sections);
    dispatch({
      type: "add",
      id,
      sectionType: type,
      defaults: { businessName: business.name, bookingNoun: business.vocabulary.booking.toLowerCase() },
    });
    onAdded(id);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden /> Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Add a section</DropdownMenuLabel>
        {SECTION_TYPES.map((type) => {
          const blocked = addBlocker(plan, type);
          const Icon = editorFor(type).icon;
          return (
            <DropdownMenuItem
              key={type}
              disabled={!!blocked}
              onSelect={() => add(type)}
              className="items-start"
            >
              <Icon className="mt-0.5" />
              <span className="flex flex-col">
                <span>{sectionDef(type).label}</span>
                <span className="text-xs text-muted-foreground">
                  {blocked ?? sectionDef(type).description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
