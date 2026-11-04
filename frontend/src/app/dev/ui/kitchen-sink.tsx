"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { BrandSection } from "./_kitchen-sink/brand";
import { ColourSection } from "./_kitchen-sink/colour";
import { TypeSection } from "./_kitchen-sink/type";
import { ButtonsSection } from "./_kitchen-sink/buttons";
import { BadgesSection } from "./_kitchen-sink/badges";
import { FormsSection } from "./_kitchen-sink/forms";
import { PickersSection } from "./_kitchen-sink/pickers";
import { CardsSection } from "./_kitchen-sink/cards";
import { NavigationSection } from "./_kitchen-sink/navigation";
import { TableSection } from "./_kitchen-sink/table";
import { OverlaysSection } from "./_kitchen-sink/overlays";
import { FeedbackSection } from "./_kitchen-sink/feedback";
import { ThemingSection } from "./_kitchen-sink/theming";

const SECTIONS = [
  "brand",
  "colour",
  "type",
  "buttons",
  "badges",
  "forms",
  "pickers",
  "cards",
  "navigation",
  "table",
  "overlays",
  "feedback",
  "theming",
] as const;

export function KitchenSink() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Logo size="sm" />
          <Badge tone="warning">/dev/ui</Badge>
          <nav className="hidden flex-1 scrollbar-none gap-1 overflow-x-auto md:flex">
            {SECTIONS.map((s) => (
              <a
                key={s}
                href={`#${s}`}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground capitalize hover:bg-accent hover:text-foreground"
              >
                {s}
              </a>
            ))}
          </nav>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-10">
        <PageHeader
          title="Design system"
          description="Every component in src/components/ui, in one place. Toggle the theme top-right. Shell previews: marketing (/), dashboard and public booking below."
          actions={
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href="/dev/ui/dashboard">Dashboard shell</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/dev/ui/public">Public shell</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/dev/ui/sites">Site themes</Link>
              </Button>
            </>
          }
        />
        <BrandSection />
        <ColourSection />
        <TypeSection />
        <ButtonsSection />
        <BadgesSection />
        <FormsSection />
        <PickersSection />
        <CardsSection />
        <NavigationSection />
        <TableSection />
        <OverlaysSection />
        <FeedbackSection />
        <ThemingSection />
      </div>
    </div>
  );
}
