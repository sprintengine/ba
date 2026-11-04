"use client";

import { errorMessage } from "@/lib/api/client";
import { toast } from "@/components/ui/toast";

/**
 * Runs a mutation and answers it with a toast: `success` (or what it makes of the result) when it resolves, the
 * error's message when it fails. Never throws; resolves to whether it succeeded, so the caller can close a dialog
 * or move on only then.
 *   onConfirm={() => withToast(() => remove.mutateAsync(id), "Question deleted")}
 */
export async function withToast<T>(
  action: () => Promise<T>,
  success: string | ((result: T) => string),
): Promise<boolean> {
  try {
    const result = await action();
    toast.success(typeof success === "function" ? success(result) : success);
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    return false;
  }
}
