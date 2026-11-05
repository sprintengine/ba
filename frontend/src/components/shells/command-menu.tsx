"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LogOut, Moon, Plus, Sun, Laptop, CalendarPlus, PanelsTopLeft } from "lucide-react";
import { AiIcon } from "@/components/brand/logo";
import type { Membership, MemberRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/context";
import { permissionsFor } from "@/lib/business/permissions";
import { useVocabulary } from "@/lib/vocabulary";
import { useThemeChoice } from "@/components/common/theme-toggle";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { ASSISTANT_NAME, ASSISTANT_SHORTCUT } from "@/lib/assistant/constants";
import { heardText, joinText } from "@/lib/assistant/dictation";
import { useDictation } from "@/lib/assistant/use-dictation";
import { BoCharacter } from "@/components/assistant/bo-character";
import { DictationButton } from "@/components/assistant/dictation";
import { BusinessTile } from "./business-tile";
import { dashboardHref, dashboardNavFor } from "./dashboard-nav";

/** Extra palette content (e.g. live search results); rendered first inside the list. */
export type CommandMenuExtension = (ctx: { search: string; close: () => void }) => React.ReactNode;

/**
 * ⌘K palette for the dashboard: navigation, quick actions, business switching, theme.
 * Page builders can add actions here (keep them to verbs that make sense everywhere).
 * `extension` renders extra groups (use `forceMount` on async results so cmdk
 * doesn't filter them out).
 */
export function CommandMenu({
  open,
  onOpenChange,
  slug,
  role,
  memberships,
  extension,
  onAskAssistant,
  sitesEnabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  role: MemberRole;
  /** Business websites are on: "View site" and the site-builder actions appear. */
  sitesEnabled?: boolean;
  memberships: Membership[];
  extension?: CommandMenuExtension;
  /** "Ask Bo…": opens the assistant with what was typed. */
  onAskAssistant?: (question: string) => void;
}) {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { v } = useVocabulary();
  const { signOut } = useAuth();
  const { setTheme } = useThemeChoice();
  // "Ask Bo" by voice: the words land in the search box (shown as they are heard), then the Ask entry sends them.
  const dictation = useDictation({ onEnd: (heard) => setSearch((typed) => joinText(typed, heard)) });
  const shown = dictation.listening ? joinText(search, heardText(dictation.heard)) : search;

  const run = (fn: () => void) => {
    dictation.cancel();
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          dictation.cancel();
          setSearch("");
        }
        onOpenChange(next);
      }}
    >
      <CommandInput
        placeholder={dictation.listening ? "Listening…" : "Search or jump to…"}
        value={shown}
        onValueChange={(next) => {
          // Typing takes over from dictation: what was heard is already in the text.
          if (dictation.listening) dictation.cancel();
          setSearch(next);
        }}
        trailing={
          onAskAssistant && dictation.supported ? (
            <DictationButton dictation={dictation} disabled={false} />
          ) : undefined
        }
      />
      {/* Live search results are mounted outside cmdk's own count, so it would call them "nothing". */}
      <CommandList className="max-h-[min(60vh,26rem)] [&:has([cmdk-group]:not([hidden]))_[cmdk-empty]]:hidden">
        <CommandEmpty>Nothing found.</CommandEmpty>
        {extension?.({ search, close: () => onOpenChange(false) })}
        <CommandGroup heading="Actions">
          {onAskAssistant && (
            // The value includes the search, so the entry always matches what was typed.
            <CommandItem
              value={`ask ${ASSISTANT_NAME} ${shown}`}
              onSelect={() => run(() => onAskAssistant(shown))}
            >
              <BoCharacter size={16} />{" "}
              {shown.trim() ? `Ask ${ASSISTANT_NAME}: “${shown.trim()}”` : `Ask ${ASSISTANT_NAME}…`}
              <CommandShortcut>{ASSISTANT_SHORTCUT.label}</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={() => run(() => router.push(`${dashboardHref(slug, "bookings")}?new=1`))}>
            <CalendarPlus /> New {v("booking")}
          </CommandItem>
          {sitesEnabled && (
            <CommandItem onSelect={() => run(() => window.open(`/${slug}`, "_blank", "noopener"))}>
              <ExternalLink /> View site
            </CommandItem>
          )}
          <CommandItem onSelect={() => run(() => window.open(`/${slug}/book`, "_blank", "noopener"))}>
            <ExternalLink /> View booking page
          </CommandItem>
          {permissionsFor(role, { sitesEnabled }).manageSite && (
            <>
              <CommandItem
                value="edit site theme sections"
                onSelect={() => run(() => router.push(dashboardHref(slug, "site")))}
              >
                <PanelsTopLeft /> Edit site
              </CommandItem>
              <CommandItem
                value="change site with ai"
                onSelect={() => run(() => router.push(`${dashboardHref(slug, "site")}?tab=ai`))}
              >
                <AiIcon /> Change site with AI
              </CommandItem>
            </>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {dashboardNavFor(role, sitesEnabled).map((item) => {
            const label = item.vocabulary ? v(item.vocabulary, { title: true }) : item.label;
            return (
              <CommandItem
                key={item.key}
                value={`go ${label}`}
                onSelect={() => run(() => router.push(dashboardHref(slug, item.segment)))}
              >
                <item.icon /> {label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {memberships.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch business">
              {memberships
                .filter((m) => m.slug !== slug)
                .map((m) => (
                  <CommandItem
                    key={m.businessId}
                    value={`switch ${m.name}`}
                    onSelect={() => run(() => router.push(dashboardHref(m.slug)))}
                  >
                    <BusinessTile
                      name={m.name}
                      logoUrl={m.branding.logoUrl}
                      color={m.branding.primaryColor}
                      size="sm"
                    />
                    {m.name}
                    <CommandShortcut className="capitalize">{m.role}</CommandShortcut>
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="General">
          <CommandItem onSelect={() => run(() => router.push("/onboarding"))}>
            <Plus /> Create a new business
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            <Sun /> Light theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            <Moon /> Dark theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("system"))}>
            <Laptop /> System theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => void signOut({ redirectUrl: "/" }))}>
            <LogOut /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
