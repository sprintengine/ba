import { Apple, BatteryFull, Check, Link2, Signal, WandSparkles, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, FaceSlot, Live, Pill, Tile } from "./face-parts";

/** Face 6: the client's booking page on a phone. Face 7: the closing "describe your business" card. */
export function PhoneFace() {
  const days: [string, string][] = [
    ["Thu", "12"],
    ["Fri", "13"],
    ["Sat", "14"],
    ["Mon", "16"],
    ["Tue", "17"],
  ];
  const times = ["09:00", "10:15", "11:30", "14:00", "15:30", "16:45"];
  return (
    <FaceSlot index={6} className="flex flex-col p-[16px_18px_30px]">
      <div className="tnum flex items-center justify-between px-2 pt-0.5 text-[13px] font-semibold [&_svg]:size-[13px]">
        <span>9:41</span>
        <span className="h-6 w-[84px] rounded-[14px] bg-primary" />
        <span className="flex gap-[5px]">
          <Signal />
          <Wifi />
          <BatteryFull />
        </span>
      </div>
      <span className="mx-auto mt-3 inline-flex items-center gap-[5px] rounded-lg bg-(--prism-hairline) px-2.5 py-[5px] text-[11px] font-medium text-muted-foreground [&_svg]:size-3">
        <Link2 />
        bookanything.ie/lumen-physio
      </span>
      <div className="mt-4 flex items-center gap-2.5">
        <Tile className="size-10 rounded-xl text-[13px]">LP</Tile>
        <span>
          <b className="block text-[17px] font-semibold tracking-[-0.02em]">Lumen Physio</b>
          <span className="block text-xs text-muted-foreground">Physiotherapy · Dublin</span>
        </span>
      </div>
      <Chip className="mt-3.5 flex items-center justify-between px-3.5 py-3 text-[13px]">
        <span>
          <b className="block text-sm font-semibold">Initial assessment</b>
          <span className="text-muted-foreground">45 min · Aoife Byrne</span>
        </span>
        <b className="tnum text-sm font-semibold">€70</b>
      </Chip>
      <div className="mt-3.5 grid grid-cols-5 gap-1.5">
        {days.map(([d, n]) => (
          <div
            key={n}
            className={cn(
              "rounded-[11px] py-[7px] text-center text-[10.5px] font-semibold shadow-(--prism-ring)",
              n === "13"
                ? "bg-primary text-primary-foreground/70"
                : "bg-(--prism-chip) text-muted-foreground",
            )}
          >
            {d}
            <b
              className={cn(
                "mt-px block text-base font-semibold",
                n === "13" ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {n}
            </b>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {times.map((t) => (
          <div
            key={t}
            className={cn(
              "tnum relative rounded-[11px] py-2.5 text-center text-[13px] font-semibold",
              t === "11:30"
                ? "bg-surface shadow-[0_0_0_1.5px_var(--foreground)]"
                : "bg-(--prism-chip) shadow-(--prism-ring)",
            )}
          >
            {t}
            {t === "14:00" && (
              <small className="absolute -top-[7px] -right-[3px] rounded-md bg-surface px-[5px] py-px text-[9.5px] font-bold shadow-(--prism-ring)">
                −15%
              </small>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-(--prism-chip) text-[12.5px] font-medium shadow-(--prism-ring)">
        <div className="flex justify-between px-3 py-[9px]">
          <span className="font-normal text-muted-foreground">Name</span>Ciarán Walsh
        </div>
        <div className="tnum flex justify-between border-t border-(--prism-hairline) px-3 py-[9px]">
          <span className="font-normal text-muted-foreground">Mobile</span>087 412 6630
        </div>
      </div>
      <div className="mt-2 rounded-xl bg-(--prism-hairline) px-3 py-[11px] text-[11.5px]">
        <b className="block text-[13px] font-semibold">Fri 13 June · 11:30</b>
        <span className="text-muted-foreground">Aoife Byrne · free to cancel until Thu 11:30</span>
      </div>
      <div className="mt-auto flex h-[46px] items-center justify-center gap-[7px] rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground shadow-md [&_svg]:size-4">
        <Apple />
        Pay €70
      </div>
      <p className="mt-[9px] text-center text-[11px] text-muted-foreground">
        No account needed · change or cancel from one link
      </p>
    </FaceSlot>
  );
}

export function SetupFace() {
  const drafted = ["6 services", "Opening hours", "Aoife and Sam", "Rehab gym · Shockwave"];
  return (
    <FaceSlot index={7} className={cn("flex flex-col p-[28px_30px_24px]", "max-[760px]:p-[22px]")}>
      <div className="flex items-center gap-2.5 text-[13px] font-semibold [&_svg]:size-4">
        <WandSparkles />
        Describe your business
        <span className={cn("ml-auto font-medium text-muted-foreground", "max-[760px]:hidden")}>
          Setup · about 4 minutes
        </span>
      </div>
      <p
        className={cn(
          "mt-3 text-[19px] leading-[1.4] font-medium tracking-[-0.015em]",
          "max-[760px]:text-base",
        )}
      >
        “A physio clinic in Dublin. Two physios, a rehab gym and a shockwave machine.”
        <i
          className={cn(
            "ml-[3px] inline-block h-5 w-0.5 align-[-3px]",
            "bg-linear-to-b from-prism-cyan via-prism-lilac to-prism-peach",
          )}
        />
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {drafted.map((d) => (
          <Pill key={d} ok className="h-[26px] px-2.5 text-xs">
            <Check />
            {d}
          </Pill>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-(--prism-hairline) pt-3.5 text-[13px] font-medium text-muted-foreground [&_svg]:size-4">
        <Link2 />
        bookanything.ie/lumen-physio
        <Live className="ml-auto">Live</Live>
      </div>
    </FaceSlot>
  );
}
