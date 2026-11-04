"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Brain, House, SquarePen, X } from "lucide-react";
import { formatCredits } from "@/lib/ai/credits";
import { ASSISTANT_NAME, ASSISTANT_SHORTCUT } from "@/lib/assistant/constants";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { CreditsNotice } from "@/components/ai/credits";
import { ResponsivePanel } from "@/components/ui/responsive-panel";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { useAssistant, type AssistantView } from "./assistant-context";
import { AssistantHome, NotConfigured } from "./assistant-home";
import { BoCharacter } from "./bo-character";
import { ChatMessages } from "./chat-messages";
import { Composer } from "./composer";
import { MemoryView } from "./memory-view";

const VIEWS: { view: AssistantView; label: string; icon: typeof House }[] = [
  { view: "home", label: "Home", icon: House },
  { view: "memory", label: "Memory", icon: Brain },
];

/** Bo's panel: a side sheet on desktop, a drawer on mobile. Home, a conversation, or the business memory. */
export function AssistantPanel() {
  const { open, setOpen, view, setView, mood, chat, state, setTyping } = useAssistant();
  const business = useCurrentBusiness();
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  const credits = chat.state.credits ?? state?.credits;
  const configured = state?.configured ?? false;
  const canSend = configured && !!credits && !credits.limitReached;

  useEffect(() => {
    // Following a link from Bo (a result, a nudge) closes the panel.
    if (pathname !== lastPath.current) setOpen(false);
    lastPath.current = pathname;
  }, [pathname, setOpen]);

  const close = () => setOpen(false);

  const title = (
    <span className="flex items-center gap-2.5">
      <BoCharacter mood={mood} size={34} labelled />
      <span className="flex flex-col">
        <span className="leading-5">{ASSISTANT_NAME}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {!configured
            ? "AI not connected"
            : credits
              ? `${formatCredits(credits.remaining, business.locale)} AI credits left`
              : "Your assistant"}
        </span>
      </span>
    </span>
  );

  const toolbar = (
    <div className="mt-1 flex items-center gap-1" role="toolbar" aria-label={`${ASSISTANT_NAME} views`}>
      {VIEWS.map(({ view: v, label, icon: Icon }) => (
        <Button
          key={v}
          size="xs"
          variant="ghost"
          aria-pressed={view === v}
          className={cn(view === v && "bg-accent text-foreground")}
          onClick={() => setView(v)}
        >
          <Icon aria-hidden /> {label}
        </Button>
      ))}
      <Button
        size="xs"
        variant="ghost"
        disabled={!configured}
        onClick={() => {
          chat.openThread(null);
          setView("chat");
        }}
      >
        <SquarePen aria-hidden /> New chat
      </Button>
      <span className="ml-auto hidden items-center gap-0.5 text-xs text-subtle-foreground sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>{ASSISTANT_SHORTCUT.key.toUpperCase()}</Kbd>
      </span>
      {/* The phone drawer fills the screen and has no close button of its own (the side sheet does). */}
      <IconButton
        label={`Close ${ASSISTANT_NAME}`}
        className="absolute top-4 right-3 sm:hidden"
        onClick={close}
      >
        <X />
      </IconButton>
    </div>
  );

  const footer =
    view === "memory" ? undefined : (
      <Composer
        disabled={!canSend}
        busy={chat.busy}
        placeholder={
          !configured
            ? "AI isn't configured"
            : credits?.limitReached
              ? "Out of AI credits this month"
              : undefined
        }
        onTyping={setTyping}
        unsent={chat.state.unsent}
        onSend={(text) => {
          if (view === "home") {
            chat.startChat(text);
            setView("chat");
          } else chat.send(text);
        }}
      />
    );

  return (
    <ResponsivePanel
      open={open}
      onOpenChange={setOpen}
      title={title}
      header={toolbar}
      footer={footer}
      size="md"
      className="h-[calc(100dvh-max(0.5rem,env(safe-area-inset-top)))] max-h-none sm:h-auto sm:max-w-md"
    >
      {view === "home" && <AssistantHome onNavigate={close} />}
      {view === "memory" && <MemoryView />}
      {view === "chat" && (
        <div className="flex flex-col gap-4">
          {!configured && <NotConfigured />}
          <ChatMessages onNavigate={close} />
          {configured && credits && <CreditsNotice credits={credits} />}
        </div>
      )}
    </ResponsivePanel>
  );
}
