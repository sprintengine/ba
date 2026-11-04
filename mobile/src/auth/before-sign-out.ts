/**
 * Work that must happen while the person is still signed in, before a sign-out clears their token: e.g. telling the
 * backend to stop sending push notifications to this device. Each task gets a few seconds; a failure never blocks
 * signing out.
 */
import { logError } from "~/lib/logger";

type Task = () => Promise<unknown>;

const tasks = new Set<Task>();

/** How long sign-out waits for each task (a slow network must not trap someone signed in). */
export const BEFORE_SIGN_OUT_MS = 4_000;

/** Registers [task] to run before every sign-out; returns the unregister function. */
export function beforeSignOut(task: Task): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

/** Runs every registered task (in parallel, each with a time limit). The auth providers call it. */
export async function runBeforeSignOut(): Promise<void> {
  await Promise.all(
    [...tasks].map((task) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        task().catch((e: unknown) => logError(e, { during: "sign-out" })),
        new Promise((resolve) => {
          timer = setTimeout(resolve, BEFORE_SIGN_OUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));
    }),
  );
}
