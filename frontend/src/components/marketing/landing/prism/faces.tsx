import { Apple, ArrowRight, Bell, Check } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { cn } from "@/lib/utils";
import { SetupFace } from "./face-phone";
import { BoPebble, Chip, FaceSlot, LIGHT_LINE, Live, Pill, Tile } from "./face-parts";

/*
 * The product UI drawn in glass: the hero's face on the slab, and one face per story beat in the page. Real text
 * (crisp at any zoom), hidden from assistive tech: the headings beside each face say what it shows. One business
 * throughout: Lumen Physio, Dublin.
 */

function HeroFace() {
  const dots = [2, 9, 14, 21, 26, 31, 38, 44, 49, 58, 63, 69, 74, 80, 85, 90, 95, 99];
  const free = new Set([58, 63]);
  return (
    <FaceSlot
      index={0}
      className={cn("flex flex-col px-[42px] pt-[38px] pb-[34px]", "max-[760px]:p-[22px_22px_20px]")}
    >
      <div className={cn("flex items-center gap-2.5 text-sm font-semibold", "max-[760px]:text-[12.5px]")}>
        <Tile>LP</Tile>
        <span>
          Lumen Physio <span className="text-muted-foreground">· Dublin</span>
        </span>
        <Live className="ml-auto">Today</Live>
      </div>
      <p
        className={cn(
          "mt-auto text-[72px] leading-none font-semibold tracking-[-0.05em]",
          "max-[760px]:text-[40px]",
        )}
      >
        Thursday
      </p>
      <p
        className={cn(
          "tnum mt-2.5 text-[33px] font-semibold tracking-[-0.035em] text-muted-foreground",
          "max-[760px]:mt-1.5 max-[760px]:text-lg",
        )}
      >
        <b className="font-semibold text-foreground">18 booked</b> ·{" "}
        <b className="font-semibold text-foreground">€1,240</b> taken
      </p>
      <div className={cn("relative mt-[30px] h-[34px]", "max-[760px]:mt-[18px]")}>
        <div className="absolute inset-x-0 top-3 h-0.5 rounded-full bg-(--prism-hairline)" />
        {dots.map((x) => (
          <i
            key={x}
            className={cn(
              "absolute top-[9px] size-2 -translate-x-1/2 rounded-full",
              free.has(x) ? "shadow-[inset_0_0_0_1.5px_var(--subtle-foreground)]" : "bg-foreground/85",
            )}
            style={{ left: `${x}%` }}
          />
        ))}
        <div
          className={cn(
            "absolute top-0.5 h-[22px] w-0.5 rounded-full shadow-[0_0_10px_var(--color-prism-lilac)]",
            LIGHT_LINE,
          )}
          style={{ left: "33.5%" }}
        />
        <div className="tnum absolute inset-x-0 top-6 flex justify-between text-[11px] font-medium text-muted-foreground">
          {["08:00", "11:00", "14:00", "17:00", "19:00"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </FaceSlot>
  );
}

const NEXT_UP = [
  { t: "09:00", what: "Initial assessment", who: "Ciarán Walsh", pill: "Paid €70", ok: true },
  { t: "09:30", what: "Shockwave", who: "Liam Byrne · Sam", pill: "Deposit €20" },
  { t: "10:30", what: "Rehab class", who: "Rehab gym", pill: "6 of 8" },
  { t: "14:00", what: "Off-peak offer on", who: "3 slots", pill: "−15%" },
];

export function TodayFace() {
  return (
    <FaceSlot
      index={1}
      className={cn("flex flex-col gap-[18px] p-[30px_32px]", "max-[760px]:gap-3.5 max-[760px]:p-[22px]")}
    >
      <div className="flex items-start gap-3">
        <p
          className={cn(
            "text-[26px] leading-[1.1] font-semibold tracking-[-0.035em]",
            "max-[760px]:text-[21px]",
          )}
        >
          Good morning, Aoife.
          <br />
          <span className="font-medium text-muted-foreground">Three gaps after lunch.</span>
        </p>
        <Pill className="ml-auto">Thu 12 June</Pill>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          ["18", "booked"],
          ["€1,240", "taken"],
          ["14", "reminders out"],
        ].map(([n, l]) => (
          <Chip key={l} className={cn("px-3.5 py-[13px]", "max-[760px]:px-[11px] max-[760px]:py-2.5")}>
            <b
              className={cn("tnum block text-[22px] font-semibold tracking-[-0.03em]", "max-[760px]:text-lg")}
            >
              {n}
            </b>
            <span
              className={cn(
                "text-xs font-medium whitespace-nowrap text-muted-foreground",
                "max-[760px]:text-[11px]",
              )}
            >
              {l}
            </span>
          </Chip>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Next up</p>
        <ul>
          {NEXT_UP.map((r, i) => (
            <li
              key={r.t}
              className={cn(
                "flex items-center gap-3 px-0.5 py-2.5 text-[13.5px]",
                i > 0 && "border-t border-(--prism-hairline)",
                "max-[760px]:py-[9px]",
              )}
            >
              <span className="tnum w-[42px] font-semibold">{r.t}</span>
              <span className="min-w-0 flex-1 truncate">
                <b className="font-semibold">{r.what}</b>{" "}
                <span className={cn("text-muted-foreground", "max-[760px]:hidden")}>· {r.who}</span>
              </span>
              <Pill ok={r.ok}>
                {r.ok && <Check />}
                {r.pill}
              </Pill>
            </li>
          ))}
        </ul>
      </div>
    </FaceSlot>
  );
}

export function ReminderFace() {
  return (
    <FaceSlot
      index={3}
      className={cn("flex items-center gap-4 px-[22px]", "max-[760px]:gap-3 max-[760px]:px-4")}
    >
      <span
        className={cn(
          "relative grid size-[60px] shrink-0 place-items-center rounded-full bg-primary text-2xl text-primary-foreground shadow-md [&_svg]:size-[1em]",
          "max-[760px]:size-[50px] max-[760px]:text-xl",
        )}
      >
        <Bell />
        <span className="absolute -inset-1 rounded-full bg-(image:--prism-rim) mask-[radial-gradient(closest-side,transparent_calc(100%-2px),#000_calc(100%-1.5px))] opacity-90" />
      </span>
      <span className="min-w-0">
        <b
          className={cn("tnum block text-[23px] font-semibold tracking-[-0.03em]", "max-[760px]:text-[19px]")}
        >
          14 reminders sent
        </b>
        <span
          className={cn(
            "text-[13.5px] font-medium whitespace-nowrap text-muted-foreground",
            "max-[760px]:text-xs",
          )}
        >
          Email and text · for Friday’s bookings
        </span>
      </span>
      <Pill ok className={cn("ml-auto h-[30px] rounded-[10px] px-3 text-[13px]", "max-[760px]:hidden")}>
        <Check />
        Delivered
      </Pill>
    </FaceSlot>
  );
}

export function PaymentFace() {
  const rows = [
    ["Initial assessment · 45 min", "€70.00"],
    ["Client", "Ciarán Walsh"],
    ["Platform fee", "€0.00"],
    ["You receive", "€70.00"],
  ];
  return (
    <FaceSlot
      index={4}
      className={cn(
        "flex flex-col items-center p-[30px_30px_26px] text-center",
        "max-[760px]:p-[24px_22px_20px]",
      )}
    >
      <span className="grid size-[46px] place-items-center rounded-full bg-primary text-primary-foreground shadow-md [&_svg]:size-[22px]">
        <Check />
      </span>
      <p
        className={cn(
          "tnum mt-[18px] text-[58px] leading-none font-semibold tracking-[-0.05em]",
          "max-[760px]:text-[50px]",
        )}
      >
        €70
        <small className="text-[30px] font-semibold tracking-[-0.03em] text-muted-foreground">.00</small>
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground [&_svg]:size-[1em]">
        <Apple />
        Paid with Apple Pay · 09:12
      </p>
      <div className={cn("mt-6 w-full text-left", "max-[760px]:mt-4")}>
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              "flex justify-between border-t border-(--prism-hairline) px-0.5 py-[11px] text-[13.5px]",
              i === 1 && "max-[760px]:hidden",
            )}
          >
            <span className="text-muted-foreground">{k}</span>
            <b className="tnum inline-flex items-center gap-2 font-semibold">
              {v}
              {i === 2 && <Pill>0%</Pill>}
            </b>
          </div>
        ))}
      </div>
      <Chip className="mt-auto flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px]">
        <Tile className="rounded-lg">LP</Tile>
        <span>
          <b className="font-semibold">Paid to your Stripe</b>
          <br />
          <span className="text-muted-foreground">Lumen Physio · straight to your balance</span>
        </span>
      </Chip>
    </FaceSlot>
  );
}

const MOVES = [
  { t: "14:00", what: "Follow-up", who: "Gráinne Lynch" },
  { t: "14:45", what: "Sports massage", who: "Dara Quinn" },
  { t: "15:30", what: "Follow-up", who: "Seán Murphy" },
];

export function BoFace() {
  return (
    <FaceSlot
      index={5}
      className={cn("flex flex-col gap-4 p-[26px_28px]", "max-[760px]:gap-[13px] max-[760px]:p-5")}
    >
      <div className="flex items-center gap-[11px] text-sm font-semibold">
        <BoPebble />
        <span>
          {ASSISTANT_NAME}
          <small className="block text-xs font-medium text-muted-foreground">Proposal · needs your OK</small>
        </span>
        <Pill className="ml-auto">3 changes</Pill>
      </div>
      <p
        className={cn(
          "text-[17px] leading-[1.45] font-medium tracking-[-0.012em]",
          "max-[760px]:text-[15px]",
        )}
      >
        Sam is off on Friday afternoon.{" "}
        <span className="text-muted-foreground">
          I can move his three bookings to Aoife, who’s free, and text each client.
        </span>
      </p>
      <Chip className="px-3.5 py-1">
        {MOVES.map((m, i) => (
          <div
            key={m.t}
            className={cn(
              "flex items-center gap-2.5 py-2.5 text-[13px]",
              i > 0 && "border-t border-(--prism-hairline)",
              i === 2 && "max-[760px]:hidden",
            )}
          >
            <span className="tnum w-10 font-semibold">{m.t}</span>
            <span className="min-w-0 flex-1 truncate">
              {m.what} <span className="text-muted-foreground">· {m.who}</span>
            </span>
            <span className="inline-flex items-center gap-[5px] text-xs font-semibold [&_svg]:size-3 [&_svg]:text-muted-foreground">
              <s className="text-subtle-foreground no-underline">Sam</s>
              <ArrowRight />
              Aoife
            </span>
          </div>
        ))}
      </Chip>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-10 items-center gap-[7px] rounded-xl bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-md [&_svg]:size-4">
          <Check />
          Confirm
        </span>
        <span className="inline-flex h-10 items-center rounded-xl bg-(--prism-chip) px-4 text-sm font-semibold shadow-(--prism-ring)">
          Not now
        </span>
        <span className={cn("ml-auto text-xs text-muted-foreground", "max-[760px]:hidden")}>
          Nothing changes until you confirm.
        </span>
      </div>
    </FaceSlot>
  );
}

/** The faces that ride the slab: the hero's and the closing call to action's. */
export function SlabFaces() {
  return (
    <>
      <HeroFace />
      <SetupFace />
    </>
  );
}
