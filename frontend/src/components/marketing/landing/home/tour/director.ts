/** What a stopped script's waits reject with, so the script ends where it stands. */
export class Stopped extends Error {}

type Sleep = { left: number; started: number; timer: number; wake: () => void; fail: (e: Stopped) => void };

/**
 * The one clock behind the hero: every wait and every animation in its script runs through here, so a pause holds all
 * of them at once and they carry on from exactly there. Anything can hold the clock (the pause button, the page being
 * scrolled away, the tab being hidden); it runs when nothing does.
 */
export function createDirector() {
  const sleeps = new Set<Sleep>();
  const motions = new Set<Animation>();
  const cleanups = new Set<() => void>();
  const holds = new Set<string>();
  let stopped = false;

  const arm = (s: Sleep) => {
    s.started = performance.now();
    s.timer = window.setTimeout(() => {
      sleeps.delete(s);
      s.wake();
    }, s.left);
  };

  const apply = (held: boolean) => {
    for (const s of sleeps) {
      if (held) {
        window.clearTimeout(s.timer);
        s.left = Math.max(0, s.left - (performance.now() - s.started));
      } else {
        arm(s);
      }
    }
    for (const m of motions) {
      if (held) m.pause();
      else m.play();
    }
  };

  return {
    /** Waits this long, in running time. */
    sleep(ms: number) {
      return new Promise<void>((wake, fail) => {
        if (stopped) return fail(new Stopped());
        const s: Sleep = { left: ms, started: 0, timer: 0, wake, fail };
        sleeps.add(s);
        if (holds.size === 0) arm(s);
      });
    },
    /** Puts an animation on the clock, and waits for it to end. */
    async play(motion: Animation) {
      motions.add(motion);
      if (holds.size > 0) motion.pause();
      try {
        await motion.finished;
      } catch {
        throw new Stopped();
      } finally {
        motions.delete(motion);
      }
    },
    /** Sets or lifts one reason to stand still. */
    hold(reason: string, on: boolean) {
      const was = holds.size > 0;
      if (on) holds.add(reason);
      else holds.delete(reason);
      const held = holds.size > 0;
      if (held !== was) apply(held);
    },
    /** Something to take down when the stage goes. */
    onStop(cleanup: () => void) {
      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    stop() {
      stopped = true;
      for (const s of sleeps) {
        window.clearTimeout(s.timer);
        s.fail(new Stopped());
      }
      sleeps.clear();
      for (const m of motions) m.cancel();
      for (const c of cleanups) c();
      cleanups.clear();
    },
  };
}

export type Director = ReturnType<typeof createDirector>;

/** Runs a script until the stage goes. */
export function run(script: () => Promise<void>) {
  script().catch((e: unknown) => {
    if (!(e instanceof Stopped)) throw e;
  });
}
