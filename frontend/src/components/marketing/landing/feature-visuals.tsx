import { ArrowUpRight, Bot, Check, EyeOff, Lock, X } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { INDUSTRY_LIST } from "../industry-content";
import { CalBlock, CAL_BOOKINGS, CAL_COLUMNS } from "./prism/face-calendar";
import { BoPebble, LIGHT_BAR, LIGHT_LINE, Tile } from "./prism/face-parts";
import s from "./prism/prism.module.css";

/** A pane of glass that tilts with the tile it sits in. */
export function Pane({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div data-tilt className={cn(s.gl, "rounded-[22px]", className)}>
      {children}
    </div>
  );
}

/** The calendar face in miniature: 09:30–12:30 for each person, room and machine. */
export function MiniCalendar() {
  const H0 = 9.5;
  const PX = 56;
  return (
    <Pane className="grid w-full max-w-[35rem] grid-cols-4 gap-2 p-4 max-sm:grid-cols-3 max-sm:p-3">
      {CAL_COLUMNS.map((c, i) => (
        <div key={c.name} className={cn(i === 3 && "max-sm:hidden")}>
          <div className="flex items-center gap-[7px] px-0.5 pt-0.5 pb-1.5 text-xs font-semibold">
            {"icon" in c ? (
              <Tile light className="size-[22px] rounded-[7px] [&_svg]:size-[11px]">
                <c.icon />
              </Tile>
            ) : (
              <Tile light={"light" in c} className="size-[22px] rounded-[7px] text-[9.5px]">
                {c.initials}
              </Tile>
            )}
            <span className="truncate">{c.name.split(" ")[0]}</span>
          </div>
          <div className="relative h-[170px] rounded-xl bg-foreground/[0.025] shadow-(--prism-ring)">
            {CAL_BOOKINGS.filter((b) => b.col === i && b.from >= H0 && b.to <= 12.5).map((b) => (
              <CalBlock
                key={b.from}
                b={{ ...b, sub: (b.to - b.from) * PX > 39 ? b.sub : "" }}
                mini
                style={{ top: (b.from - H0) * PX + 3, height: (b.to - b.from) * PX - 5 }}
              />
            ))}
          </div>
        </div>
      ))}
    </Pane>
  );
}

export function DoubleBooking() {
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col gap-2.5 p-4">
      <div className="relative rounded-[13px] bg-surface/80 py-3 pr-3.5 pl-4 text-[0.8125rem] shadow-(--prism-ring)">
        <span className={cn("absolute top-[9px] bottom-[9px] left-1.5 w-[3px] rounded-[3px]", LIGHT_BAR)} />
        <b className="block font-semibold">10:00 · Shockwave</b>
        <span className="text-muted-foreground">Liam Byrne · with Sam</span>
      </div>
      <div className="flex translate-x-2.5 rotate-[1.5deg] items-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-border-strong py-3 pr-3.5 pl-4 text-[0.8125rem] text-muted-foreground">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-[11px]">
          <X />
        </span>
        <span>
          <b className="font-semibold text-foreground">10:00 is taken.</b> Next free 10:45
        </span>
      </div>
    </Pane>
  );
}

export function AssistantChat() {
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col gap-3 p-4 text-[0.84375rem] leading-[1.45]">
      <p className="self-end rounded-[14px_14px_4px_14px] bg-primary px-[13px] py-[9px] text-[0.8125rem] text-primary-foreground">
        Who’s free Friday at 3?
      </p>
      <div className="flex gap-2.5">
        <BoPebble className="size-[26px]" />
        <p>Aoife is. Move Seán Murphy’s follow-up to her and text him?</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 items-center rounded-[10px] bg-primary px-[13px] text-[0.78125rem] font-semibold text-primary-foreground">
          Confirm
        </span>
        <span className="inline-flex h-8 items-center rounded-[10px] bg-(--prism-chip) px-[13px] text-[0.78125rem] font-semibold shadow-(--prism-ring)">
          Not now
        </span>
        <span className="sr-only">{ASSISTANT_NAME} proposes; a person confirms.</span>
      </div>
    </Pane>
  );
}

/** The owner's own AI assistant (business MCP): it prepares the change, and the owner approves it on bookanything. */
export function OwnAssistantChat() {
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col gap-3 p-4 text-[0.84375rem] leading-[1.45]">
      <p className="self-end rounded-[14px_14px_4px_14px] bg-primary px-[13px] py-[9px] text-[0.8125rem] text-primary-foreground">
        Who’s free Friday at 3?
      </p>
      <div className="flex gap-2.5">
        <Tile className="size-[26px] rounded-full shadow-md [&_svg]:size-3.5">
          <Bot />
        </Tile>
        <p>Aoife is. I’ve prepared a change: Seán Murphy’s follow-up moves to her.</p>
      </div>
      <span className="inline-flex h-8 w-fit items-center gap-1.5 rounded-[10px] bg-primary px-[13px] text-[0.78125rem] font-semibold text-primary-foreground [&_svg]:size-3.5">
        Approve on bookanything
        <ArrowUpRight />
      </span>
    </Pane>
  );
}

/** A class: several clients in one session, until the places run out. */
export function GroupSession() {
  const booked = ["Orla Kenny", "Liam Byrne", "Ciarán Walsh", "Gráinne Lynch", "Dara Quinn", "Seán Murphy"];
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col gap-3.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <b className="block text-[0.8125rem] font-semibold">Rehab class</b>
          <span className="text-xs text-muted-foreground">Thursday 18:00 · Rehab gym</span>
        </span>
        <Badge className="h-5 px-1.5 text-2xs">Up to 8</Badge>
      </div>
      <div className="flex gap-1.5">
        {booked.map((name) => (
          <Avatar key={name} name={name} size="sm" />
        ))}
        {[0, 1].map((i) => (
          <span
            key={i}
            className="size-6 rounded-full border-[1.5px] border-dashed border-border-strong bg-surface"
          />
        ))}
      </div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--prism-hairline)">
          <div className={cn("h-full w-3/4 rounded-full", LIGHT_LINE)} />
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <span className="tnum font-semibold">6 of 8 booked</span>
          <span className="text-muted-foreground">2 places left</span>
        </div>
      </div>
    </Pane>
  );
}

export function SensitiveQuestion() {
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col gap-3 p-4">
      <div className="rounded-[13px] bg-surface/80 p-3 shadow-(--prism-ring)">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">What would you like help with?</span>
          <Badge tone="warning" className="h-5 gap-1 px-1.5 text-2xs">
            <Lock /> Sensitive
          </Badge>
        </div>
        <p className="mt-2 rounded-lg bg-(--prism-chip) px-2.5 py-2 text-xs text-muted-foreground shadow-(--prism-ring)">
          Lower back pain since a fall in March
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 px-1 text-xs [&_svg]:size-3.5">
        <li className="flex items-center gap-2">
          <Check className="text-success" /> Visible to your team
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <EyeOff /> Left out of emails
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <EyeOff /> Never sent to AI models
        </li>
      </ul>
    </Pane>
  );
}

export function Vocabulary() {
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col p-2">
      {INDUSTRY_LIST.slice(0, 3).map((c, i) => (
        <div
          key={c.slug}
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2.5 text-xs",
            i > 0 && "border-t border-(--prism-hairline)",
          )}
        >
          <c.icon className="size-3.5 shrink-0 text-subtle-foreground" />
          <span className="flex flex-wrap gap-1">
            {[c.vocabulary.resources, c.vocabulary.customers, `${c.vocabulary.booking}s`].map((w) => (
              <span
                key={w}
                className="rounded-md bg-surface/80 px-1.5 py-0.5 font-medium shadow-(--prism-ring)"
              >
                {w}
              </span>
            ))}
          </span>
        </div>
      ))}
    </Pane>
  );
}

export function BrandSwatches() {
  return (
    <Pane className="grid w-[18rem] max-w-full grid-cols-2 gap-2 p-3">
      {INDUSTRY_LIST.map((c) => (
        <BusinessThemeProvider key={c.slug} primaryColor={c.color}>
          <div className="flex flex-col gap-2 rounded-[13px] bg-surface/80 p-2.5 shadow-(--prism-ring)">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-brand" />
              <span className="truncate text-2xs font-medium">{c.business.name.split(" ")[0]}</span>
            </span>
            <span className="flex h-7 items-center justify-center rounded-md bg-primary text-2xs font-medium text-primary-foreground shadow-button">
              Book now
            </span>
          </div>
        </BusinessThemeProvider>
      ))}
    </Pane>
  );
}

export function TeamList() {
  const people = [
    { name: "Aoife Byrne", role: "Owner", tone: "solid" as const },
    { name: "Sam Rivers", role: "Admin", tone: "neutral" as const },
    { name: "Niamh Doyle", role: "Staff", tone: "outline" as const },
  ];
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col p-2">
      {people.map((p, i) => (
        <div
          key={p.name}
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2.5",
            i > 0 && "border-t border-(--prism-hairline)",
          )}
        >
          <Avatar name={p.name} size="sm" />
          <span className="flex-1 truncate text-xs font-semibold">{p.name}</span>
          <Badge tone={p.tone} className="h-5 px-1.5 text-2xs">
            {p.role}
          </Badge>
        </div>
      ))}
    </Pane>
  );
}

export function GroupWindows() {
  const times = ["09:00", "09:15", "09:30", "11:00", "11:15", "14:30"];
  const members = new Set(["09:00", "09:15", "09:30"]);
  return (
    <Pane className="flex w-[18rem] max-w-full flex-col gap-3 p-4">
      <div className="inline-flex w-fit items-center gap-0.5 rounded-[10px] bg-(--prism-hairline) p-[3px] text-2xs font-semibold">
        <span className="rounded-lg px-2 py-1 text-muted-foreground">Everyone</span>
        <span className="rounded-lg bg-surface px-2 py-1 shadow-(--prism-ring)">Members</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {times.map((t) => (
          <span
            key={t}
            className={cn(
              "tnum flex h-8 items-center justify-center rounded-[10px] text-xs font-semibold",
              members.has(t)
                ? "bg-surface shadow-[0_0_0_1.5px_var(--foreground)]"
                : "text-subtle-foreground line-through shadow-(--prism-ring)",
            )}
          >
            {t}
          </span>
        ))}
      </div>
    </Pane>
  );
}
