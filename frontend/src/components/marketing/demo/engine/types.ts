/**
 * A scripted product demo: chapters of steps that drive a fake cursor over a replica of the app and change the
 * replica's state. Targets are `data-demo="<id>"` elements inside the stage.
 */

export type DemoStep<S> =
  /** Glide the cursor to a target (and hover it). */
  | { kind: "move"; target: string; ms?: number }
  /** Glide to a target, press, apply the state change, release. */
  | { kind: "click"; target: string; apply?: (s: S) => S }
  /** Focus a field and type into it, one character at a time; `apply` receives the text so far. */
  | { kind: "type"; target: string; text: string; apply: (s: S, typed: string) => S; cps?: number }
  /** Change state without the cursor (a booking arrives, a toast fades). */
  | { kind: "set"; apply: (s: S) => S }
  | { kind: "wait"; ms: number };

export type DemoChapter<S> = {
  id: string;
  /** Short label for the chapter pill ("Add a service"). */
  label: string;
  /** One sentence for screen readers and the caption under the stage. */
  caption: string;
  /** The URL shown in the browser chrome. */
  url: (s: S) => string;
  initial: S;
  steps: DemoStep<S>[];
};

export type CursorState = { x: number; y: number; ms: number; pressed: boolean; visible: boolean };

/** What the cursor is doing to the replica, so targets can show hover, press and focus styles. */
export type DemoPointer = { hover: string | null; pressed: string | null; focus: string | null };

/** The state a chapter ends in, for reduced motion (no cursor, no typing: just the result). */
export function finalState<S>(chapter: DemoChapter<S>): S {
  return chapter.steps.reduce<S>((s, step) => {
    switch (step.kind) {
      case "click":
        return step.apply ? step.apply(s) : s;
      case "type":
        return step.apply(s, step.text);
      case "set":
        return step.apply(s);
      default:
        return s;
    }
  }, chapter.initial);
}
