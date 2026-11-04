"use client";

import { resolveTeam, type ResolvedMember } from "@/lib/site/plan";
import { cn, initials } from "@/lib/utils";
import { EmptyHint, SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { SiteImageFill } from "../site-media";
import { useSiteRender } from "../site-render-context";
import { CARD } from "../theme-classes";
import type { SectionProps } from "./types";

/** The real people customers can book (active person resources), with optional bios and photos. */
export function TeamSection({ section, anchor }: SectionProps<"team">) {
  const { context, theme } = useSiteRender();
  const members = resolveTeam(section.content.members, context);
  return (
    <SectionShell anchor={anchor} sectionId={section.id} tone={theme.card === "flat" ? "plain" : "sunken"}>
      <SiteContainer className="flex flex-col gap-10 @3xl:gap-14">
        <SectionIntro heading={section.content.heading} intro={section.content.intro} />
        {members.length === 0 ? (
          <EmptyHint title="No team members yet">Add people under Resources and they appear here.</EmptyHint>
        ) : (
          <ul
            className={cn(
              "grid gap-5 @xl:grid-cols-2 @5xl:gap-6",
              members.length >= 3 && "@4xl:grid-cols-3",
              members.length >= 4 && "@6xl:grid-cols-4",
            )}
          >
            {members.map((m, i) => (
              <li key={m.id}>
                <MemberCard member={m} index={i} />
              </li>
            ))}
          </ul>
        )}
      </SiteContainer>
    </SectionShell>
  );
}

function MemberCard({ member, index }: { member: ResolvedMember; index: number }) {
  const { theme } = useSiteRender();
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden",
        CARD[theme.card],
        theme.card === "hairline" && "pt-5",
      )}
    >
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden",
          theme.card === "hairline" ? "rounded-none" : "m-2 rounded-[calc(var(--radius-xl)-0.25rem)]",
        )}
      >
        {member.photo ? (
          <SiteImageFill image={member.photo} fallbackPattern={theme.defaultPattern} />
        ) : (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              index % 2 ? "bg-highlight-soft" : "bg-brand-soft",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "site-heading text-5xl",
                index % 2 ? "text-highlight-soft-foreground" : "text-brand-soft-foreground",
              )}
            >
              {initials(member.name)}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 px-5 pt-3 pb-6">
        <h3 className="site-heading text-xl">{member.name}</h3>
        {member.bio && <p className="text-sm text-pretty text-muted-foreground">{member.bio}</p>}
      </div>
    </article>
  );
}
