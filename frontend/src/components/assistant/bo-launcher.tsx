"use client";

import { ASSISTANT_NAME, ASSISTANT_SHORTCUT } from "@/lib/assistant/constants";
import { MOOD_LABEL } from "@/lib/assistant/mood";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { useAssistantControls } from "./assistant-context";
import { BoCharacter } from "./bo-character";

/** The floating Bo button (bottom-left of the dashboard), with a badge when there are nudges. */
export function BoLauncher({ className }: { className?: string }) {
  const { open, setOpen, mood, state } = useAssistantControls();
  const nudges = state?.nudges.length ?? 0;
  const label =
    nudges > 0
      ? `Open ${ASSISTANT_NAME}, ${nudges} ${nudges === 1 ? "thing needs" : "things need"} your attention`
      : `Open ${ASSISTANT_NAME}`;
  return (
    <Tooltip content={`Ask ${ASSISTANT_NAME}`} shortcut={ASSISTANT_SHORTCUT.label} side="right">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-mood={mood}
        className={cn(
          "group relative flex size-14 items-center justify-center rounded-full bg-surface-raised shadow-lg ring-1 ring-border transition-[transform,box-shadow] duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:translate-y-0",
          className,
        )}
      >
        <BoCharacter mood={mood} size={50} />
        <span className="sr-only">{MOOD_LABEL[mood]}</span>
        {nudges > 0 && !open && (
          <span
            aria-hidden
            className="tnum absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-2xs leading-5 font-semibold text-danger-foreground ring-2 ring-surface-raised"
          >
            {nudges}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
