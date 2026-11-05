"use client";

import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "next-themes";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Spinner } from "./spinner";

/**
 * Toasts. Mounted once in root providers. Usage anywhere on the client:
 *   import { toast } from "@/components/ui/toast";
 *   toast.success("Booking cancelled");
 *   toast.error(errorMessage(err));
 *   toast.promise(save(), { loading: "Saving…", success: "Saved", error: (e) => errorMessage(e) });
 * They appear at the top: most toasts answer an action in a drawer, sheet or dialog footer, whose buttons sit at the
 * bottom (the booking drawer on the right, bottom sheets on phones), and a toast there covered the next action.
 */
export function Toaster() {
  const { forcedTheme, resolvedTheme: chosen } = useTheme();
  const resolvedTheme = forcedTheme ?? chosen;
  return (
    <Sonner
      theme={resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : "system"}
      position="top-right"
      gap={8}
      offset={20}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", left: 12, right: 12 }}
      icons={{
        success: <CircleCheck className="size-4 text-success" />,
        error: <CircleAlert className="size-4 text-danger" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        info: <Info className="size-4 text-info" />,
        loading: <Spinner className="text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-surface-raised !text-foreground !shadow-lg !font-sans !text-sm !gap-2.5 !px-4 !py-3",
          title: "!font-medium",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md !font-medium",
          cancelButton: "!bg-muted !text-foreground !rounded-md",
          closeButton: "!bg-surface-raised !border-border !text-muted-foreground",
        },
      }}
    />
  );
}

export { toast };
