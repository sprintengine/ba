import { Check, DoorOpen, Link2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaceSlot, LIGHT_BAR, LIGHT_LINE, Pill, Tile } from "./face-parts";

export const CAL_COLUMNS = [
  { name: "Aoife Byrne", kind: "Physio", initials: "AB" },
  { name: "Sam Rivers", kind: "Physio", initials: "SR", light: true },
  { name: "Rehab gym", kind: "Room", icon: DoorOpen },
  { name: "Shockwave", kind: "Equipment", icon: Zap },
] as const;

type Booking = {
  col: number;
  from: number;
  to: number;
  title: string;
  sub: string;
  paid?: string;
  /** Booked together with another resource (lit edge). */
  linked?: boolean;
  dark?: boolean;
};

export const CAL_BOOKINGS: Booking[] = [
  { col: 0, from: 9, to: 9.75, title: "Initial assessment", sub: "Ciarán Walsh", paid: "Paid €70" },
  { col: 0, from: 10, to: 10.5, title: "Follow-up", sub: "Orla Kenny" },
  { col: 0, from: 11.25, to: 12, title: "Sports massage", sub: "Ella Brennan", paid: "Paid €60" },
  { col: 0, from: 12.25, to: 12.75, title: "Follow-up", sub: "Tom Keane" },
  { col: 1, from: 9.5, to: 10.25, title: "Shockwave", sub: "Liam Byrne", paid: "Deposit €20", linked: true },
  { col: 1, from: 10.5, to: 11.5, title: "Rehab class", sub: "6 of 8 booked", linked: true, dark: true },
  { col: 1, from: 12, to: 12.75, title: "Initial assessment", sub: "Niamh Doyle", paid: "Paid €70" },
  { col: 2, from: 10.5, to: 11.5, title: "Rehab class", sub: "with Sam Rivers", linked: true, dark: true },
  { col: 2, from: 12, to: 12.5, title: "Open gym", sub: "Conor Daly" },
  { col: 3, from: 9.5, to: 10.25, title: "Shockwave", sub: "with Sam Rivers", linked: true },
  { col: 3, from: 11.75, to: 12.25, title: "Shockwave", sub: "Peadar Hayes", paid: "Paid €45" },
];

const H0 = 9;
const HOURS = 4;
const pct = (h: number) => `${((h - H0) / HOURS) * 100}%`;

/** A booking block; `mini` is the bento's smaller version. */
export function CalBlock({ b, mini, style }: { b: Booking; mini?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        "absolute overflow-hidden rounded-[10px] py-[7px] pr-[9px] pl-3 text-[11.5px] leading-[1.3]",
        mini && "inset-x-1 py-1.5 pr-[7px] pl-[11px] text-[10.5px]",
        !mini && "max-[760px]:py-[5px] max-[760px]:pr-1.5 max-[760px]:pl-2.5 max-[760px]:text-[10px]",
        b.dark
          ? "bg-primary/90 text-primary-foreground shadow-md"
          : "bg-(--prism-block) shadow-(--prism-block-shadow)",
      )}
      style={style}
    >
      <span
        className={cn(
          "absolute top-1.5 bottom-1.5 left-1 w-[3px] rounded-[3px]",
          b.linked || b.dark ? LIGHT_BAR : "bg-foreground/20",
        )}
      />
      <b className="block truncate font-semibold">{b.title}</b>
      <span className={cn("block truncate", b.dark ? "text-primary-foreground/60" : "text-muted-foreground")}>
        {b.sub}
      </span>
      {b.paid && !mini && b.to - b.from > 0.5 && (
        <span className="mt-0.5 flex items-center gap-[3px] text-[10.5px] font-semibold text-success-soft-foreground max-[760px]:hidden [&_svg]:size-[11px]">
          <Check />
          {b.paid}
        </span>
      )}
    </div>
  );
}

export function CalendarFace() {
  return (
    <FaceSlot index={2} className="flex flex-col p-[22px_22px_18px] max-[760px]:p-[14px_12px_12px]">
      <div className="flex items-center gap-2.5 px-1.5 pb-4 max-[760px]:px-1 max-[760px]:pb-2.5">
        <p className="text-[21px] font-semibold tracking-[-0.03em] whitespace-nowrap max-[760px]:text-[17px]">
          Thursday 12 June
        </p>
        <Pill>18 booked</Pill>
        <Pill className="max-[420px]:hidden">€1,240 taken</Pill>
        <span className="ml-auto inline-flex rounded-[10px] bg-(--prism-hairline) p-[3px] text-xs font-semibold max-[760px]:hidden">
          <span className="rounded-lg bg-surface px-[11px] py-1 shadow-(--prism-ring)">Day</span>
          <span className="px-[11px] py-1 text-muted-foreground">Week</span>
        </span>
      </div>
      <div className="relative grid flex-1 grid-cols-[46px_repeat(4,1fr)] grid-rows-[48px_1fr] overflow-hidden rounded-2xl bg-(--prism-well) shadow-(--prism-ring) [--gut:46px] [--nc:4] max-[760px]:grid-cols-[38px_repeat(3,1fr)] max-[760px]:[--gut:38px] max-[760px]:[--nc:3]">
        <div className="border-b border-(--prism-hairline)" />
        {CAL_COLUMNS.map((c, i) => (
          <div
            key={c.name}
            className={cn(
              "flex min-w-0 items-center gap-[9px] border-b border-l border-(--prism-hairline) px-3 text-[13px] font-semibold max-[760px]:gap-1.5 max-[760px]:px-[7px] max-[760px]:text-[11.5px]",
              i === 3 && "max-[760px]:hidden",
            )}
          >
            {"icon" in c ? (
              <Tile light className="size-[26px] rounded-lg">
                <c.icon />
              </Tile>
            ) : (
              <Tile light={"light" in c} className="size-[26px] rounded-lg">
                {c.initials}
              </Tile>
            )}
            <span className="min-w-0 truncate">
              <span className="max-[760px]:hidden">{c.name}</span>
              <span className="hidden max-[760px]:inline">{c.name.split(" ")[0]}</span>
              <small className="block text-[11px] font-medium text-muted-foreground max-[760px]:hidden">
                {c.kind}
              </small>
            </span>
          </div>
        ))}
        <div className="relative col-span-full">
          <div className="absolute inset-x-0 top-2.5 bottom-2.5">
            {Array.from({ length: HOURS + 1 }, (_, i) => (
              <div key={i} className="absolute inset-x-0" style={{ top: pct(H0 + i) }}>
                <div className="h-px bg-(--prism-hairline)" />
                <span className="tnum absolute left-2.5 -translate-y-1/2 text-[10.5px] font-medium text-muted-foreground max-[760px]:left-1.5">
                  {String(H0 + i).padStart(2, "0")}:00
                </span>
              </div>
            ))}
            <div
              className={cn(
                "absolute right-0 left-10 h-0.5 shadow-[0_0_10px_var(--color-prism-lilac)] max-[760px]:left-[34px]",
                LIGHT_LINE,
              )}
              style={{ top: pct(10.7) }}
            >
              <span className="tnum absolute top-[-7px] -left-[38px] text-[10px] font-semibold max-[760px]:-left-[33px] max-[760px]:text-[9px]">
                10:42
              </span>
            </div>
            {CAL_BOOKINGS.map((b) => (
              <div key={`${b.col}-${b.from}`} className={cn(b.col === 3 && "max-[760px]:hidden")}>
                <CalBlock
                  b={b}
                  style={{
                    top: `calc(${pct(b.from)} + 2px)`,
                    height: `calc(${pct(b.to)} - ${pct(b.from)} - 4px)`,
                    left: `calc(var(--gut) + (100% - var(--gut)) * ${b.col} / var(--nc) + 4px)`,
                    width: `calc((100% - var(--gut)) / var(--nc) - 8px)`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="absolute right-3.5 bottom-3.5 flex items-center gap-2.5 rounded-[14px] bg-surface/90 py-2.5 pr-3.5 pl-2.5 text-xs shadow-lg max-[760px]:hidden">
            <Tile className="[&_svg]:size-3.5">
              <Link2 />
            </Tile>
            <span>
              <b className="block text-[12.5px] font-semibold">Booked together</b>
              <span className="text-muted-foreground">Sam · Rehab gym · 10:30</span>
            </span>
          </div>
        </div>
      </div>
    </FaceSlot>
  );
}
