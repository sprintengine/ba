"use client";

import dynamic from "next/dynamic";
import { useIdleMount } from "@/lib/hooks/use-idle-mount";
import { AssistantProvider, useAssistantControls } from "@/components/assistant/assistant-context";
import { BoLauncher } from "@/components/assistant/bo-launcher";
import { DashboardRoot, type DashboardChrome } from "@/components/dashboard/dashboard-root";
import type { CommandMenuExtension } from "@/components/shells/command-menu";
import { DashboardShell } from "@/components/shells/dashboard-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * /dashboard/[slug]: DashboardRoot loads the business and its context; the chrome adds ⌘K search, and Bo where the
 * deployment offers it (`Business.assistantAvailable`). The dashboard's toolbars and icon buttons share one tooltip delay.
 */
export default function BusinessDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <DashboardRoot Chrome={BusinessChrome}>{children}</DashboardRoot>
    </TooltipProvider>
  );
}

/** Bo's panel and ⌘K's live search load after the page, not with it, together (see useIdleMount). */
const loadAssistantPanel = () => import("@/components/assistant/assistant-panel");
const loadCommandSearch = () => import("@/components/dashboard/command-search");
const loadDeferredChrome = () => Promise.all([loadAssistantPanel(), loadCommandSearch()]);
const AssistantPanel = dynamic(() => loadAssistantPanel().then((m) => m.AssistantPanel), { ssr: false });
const DashboardCommandSearch = dynamic(() => loadCommandSearch().then((m) => m.DashboardCommandSearch), {
  ssr: false,
});

const commandSearch: CommandMenuExtension = (ctx) => <DashboardCommandSearch {...ctx} />;

/**
 * With Bo off nothing of it mounts: no launcher, panel, ⌘J or ⌘K "Ask Bo…", and its state (nudges, credits) is never
 * requested, as those routes aren't there.
 */
const BusinessChrome: DashboardChrome = (props) =>
  props.business.assistantAvailable ? <AssistantChrome {...props} /> : <SearchChrome {...props} />;

/** The dashboard chrome without Bo: ⌘K with live search, loaded when the page goes idle like the rest. */
function SearchChrome({ children, ...shell }: React.ComponentProps<DashboardChrome>) {
  useIdleMount(loadCommandSearch, false);
  return (
    <DashboardShell {...shell} commandMenuExtension={commandSearch}>
      {children}
    </DashboardShell>
  );
}

/** The dashboard chrome with Bo: the launcher, ⌘K "Ask Bo…" and the panel. */
const AssistantChrome: DashboardChrome = ({ children, ...shell }) => (
  <AssistantProvider>
    <AssistantShell {...shell}>{children}</AssistantShell>
  </AssistantProvider>
);

function AssistantShell({ children, ...shell }: React.ComponentProps<DashboardChrome>) {
  const { ask, open } = useAssistantControls();
  const panelReady = useIdleMount(loadDeferredChrome, open);
  return (
    <DashboardShell
      {...shell}
      commandMenuExtension={commandSearch}
      floating={<BoLauncher />}
      onAskAssistant={ask}
    >
      {children}
      {panelReady && <AssistantPanel />}
    </DashboardShell>
  );
}
