"use client";

import { useSyncExternalStore } from "react";
import { Copy } from "lucide-react";
import { appOrigin, appUrl, serverAppOrigin } from "@/lib/oauth/app-url";
import { cn, copyText } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";

const noSubscribe = () => () => {};

/** The public origin: NEXT_PUBLIC_APP_URL, else the browser's origin (localhost while rendering on the server). */
export function useAppOrigin(): string {
  return useSyncExternalStore(noSubscribe, appOrigin, serverAppOrigin);
}

/** A read-only URL in a code field with a copy button (toast on copy). */
export function ServerUrlField({
  path,
  label,
  className,
}: {
  path: string;
  /** Accessible name of the field, e.g. "Your server URL". */
  label: string;
  className?: string;
}) {
  const url = appUrl(path, useAppOrigin());

  async function copy() {
    if (await copyText(url)) toast.success("Server URL copied");
    else toast.error("Couldn't copy. Select the address and copy it yourself.");
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-surface-sunken py-1.5 pr-1.5 pl-4 shadow-xs",
        className,
      )}
    >
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap text-foreground select-all">
        {url}
      </code>
      <IconButton
        label={`Copy ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
        variant="secondary"
        size="sm"
        onClick={copy}
      >
        <Copy />
      </IconButton>
    </div>
  );
}
