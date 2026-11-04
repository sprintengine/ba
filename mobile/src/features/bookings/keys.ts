/**
 * Hardware keyboard shortcuts (iPad with a keyboard, Mac): ⌘N new booking, ⌘T today, ⌘← / ⌘→… React Native has no
 * iOS key-command API, so the local Expo module `modules/key-commands` registers `UIKeyCommand`s on the app's root
 * view controller (they also appear in the ⌘-hold shortcut overlay) and sends their presses here. Where the module
 * isn't built in (Android, Jest, an older dev client) the hooks do nothing: every action stays reachable by touch,
 * VoiceOver and Full Keyboard Access.
 */
import { useFocusEffect } from "expo-router";
import { requireOptionalNativeModule } from "expo";
import { useCallback, useEffect, useRef } from "react";

export type KeyCommand = {
  /** A character ("n", "t", "1") or "left" / "right" / "up" / "down". */
  input: string;
  /** Shown in the shortcut overlay. */
  title: string;
};

type KeyCommandsModule = {
  setCommands(commands: KeyCommand[]): void;
  addListener(event: "onKeyCommand", listener: (e: { input: string }) => void): { remove(): void };
};

const native = requireOptionalNativeModule<KeyCommandsModule>("BAKeyCommands");

/** Every screen's registered commands, newest focus last; the native set is the focused screen's. */
const stack: { id: number; commands: KeyCommand[]; handle: (input: string) => void }[] = [];
let nextId = 0;

function sync() {
  native?.setCommands(stack[stack.length - 1]?.commands ?? []);
}

if (native) {
  native.addListener("onKeyCommand", ({ input }) => stack[stack.length - 1]?.handle(input));
}

/**
 * Shortcuts for the focused screen: `{ n: { title: "New booking", run } }` → ⌘N. Registered while the screen is
 * focused (a pushed screen's shortcuts replace its parent's, and come back when it pops).
 */
export function useKeyCommands(commands: Record<string, { title: string; run: () => void }>) {
  const latest = useRef(commands);
  useEffect(() => {
    latest.current = commands;
  });
  const signature = Object.entries(commands)
    .map(([input, c]) => `${input}:${c.title}`)
    .join("|");
  useFocusEffect(
    useCallback(() => {
      if (!native) return;
      const id = ++nextId;
      stack.push({
        id,
        commands: signature
          ? signature.split("|").map((pair) => {
              const [input = "", ...title] = pair.split(":");
              return { input, title: title.join(":") };
            })
          : [],
        handle: (input) => latest.current[input]?.run(),
      });
      sync();
      return () => {
        const at = stack.findIndex((s) => s.id === id);
        if (at >= 0) stack.splice(at, 1);
        sync();
      };
    }, [signature]),
  );
}

/** One shortcut: ⌘`input` runs `run` while the screen is focused. */
export function useKeyCommand(input: string, run: () => void, title = "New booking") {
  useKeyCommands({ [input]: { title, run } });
}

/** Whether the native shortcuts are built into this app (for showing hints). */
export const keyCommandsAvailable = !!native;
