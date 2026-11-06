import { BOOKED_AT, BOOKED_SERVICE, CLIENT } from "../fixture";
import { flyToCard } from "../flight";
import type { BookingDemo } from "../use-booking-demo";
import { tap } from "./cursor";
import { preloadChat } from "./stage-parts";
import type { Pointer } from "./cursor";
import type { Director } from "./director";
import type { Screen } from "./tour-app";

export type Notice = "booked" | "moved";

/** The parts of the story, as the bar under the stage names them. */
export type Chapter = "book" | "lands" | "day" | "ai";

/** Where the script starts: from the top, part way in, or with the visitor choosing the time. */
export type Entry = "book" | "day" | "ai" | "visitor";

/** Everything the script touches. It works the real controls, so it keeps working when they change. */
export type Cast = {
  director: Director;
  /** The panel: everything on stage is placed against it. */
  scene: HTMLElement;
  /** The phone's screen, and the fingertip on it. */
  phone: HTMLElement;
  finger: HTMLElement;
  demo: () => BookingDemo;
  /** Puts the booking on the calendar, at this time if it isn't the usual one, or takes it off. */
  setBooked: (booked: boolean, at?: string) => void;
  /** Moves the booking, as the owner's assistant does. */
  setMoved: () => void;
  /** Shows a notice over the calendar, or clears it. */
  notify: (notice: Notice | false) => void;
  /** The step of the owner's assistant on the phone, or the client's booking page. */
  chat: (step: number | null) => void;
  /** How much the calendar is drawn down. */
  scale: () => number;
  /** Which part of the story is on. */
  chapter: (chapter: Chapter) => void;
  /** Hands the phone to the visitor, or takes it back. */
  handOver: (theirs: boolean) => void;
};

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));

/** Waits for what the last state change put on screen. */
async function find<T>(director: Director, look: () => T | null | undefined): Promise<T> {
  for (;;) {
    const found = look();
    if (found) return found;
    await director.sleep(40);
  }
}

export const findCard = (scene: HTMLElement) =>
  [...scene.querySelectorAll<HTMLElement>("[data-event]")].find((c) => c.textContent.includes(CLIENT.name));

/** Long enough to read each step of the phone, and then to see where the booking went. */
const BEAT = { read: 1500, pick: 1250, paying: 1000, settled: 420 };

/** The assistant's steps: long enough to read the question, then what it wants to change, then the result. */
const AI_BEAT = { asked: 1900, proposal: 3000, approving: 750, done: 3600 };

/** The page's core story: the client's tap on the phone puts the card on the business's calendar. */
export async function bookingAct(c: Cast) {
  const { director, phone, finger } = c;
  const press = async (look: () => HTMLElement | null | undefined) =>
    tap(finger, phone, await find(director, look), director);

  c.chapter("book");
  await director.sleep(BEAT.read);
  await press(() => button(phone, BOOKED_SERVICE.name));
  await director.sleep(BEAT.pick);
  await press(() => button(phone, BOOKED_AT));
  await director.sleep(BEAT.pick);
  await landBooking(c, press);
}

/** Pays on the phone, and lands the booking on the calendar. The day's counts change when it arrives, not before. */
async function landBooking(
  c: Cast,
  press: (look: () => HTMLElement | null | undefined) => Promise<void>,
  at?: string,
) {
  const { director, phone } = c;
  await press(() => phone.querySelector<HTMLElement>('[data-demo="pay"]'));
  await director.sleep(BEAT.paying);
  c.demo().confirm();
  await director.sleep(BEAT.settled);
  c.chapter("lands");
  c.setBooked(true, at);
  const card = await find(director, () => findCard(c.scene));
  const release = tallies(card, c.scene).flatMap(holdBack);
  await flyToCard(card, c.scene, c.scale(), director);
  for (const undo of release) undo();
  c.notify("booked");
}

/**
 * Shows a figure as it stood before the new card, until the card has landed and it can tick up. Its text nodes are
 * changed where they stand, so React keeps track of them.
 */
function holdBack(figure: HTMLElement) {
  const texts = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT);
  const undo: (() => void)[] = [];
  for (let node = texts.nextNode(); node; node = texts.nextNode()) {
    const text = node;
    const was = text.nodeValue ?? "";
    if (!/\d/.test(was)) continue;
    text.nodeValue = was.replace(/\d+/, (n) => String(Number(n) - 1));
    undo.push(() => {
      text.nodeValue = was;
    });
    break;
  }
  return undo;
}

/** The figures a new card changes: its column's count and the day's total. */
function tallies(card: HTMLElement, scene: HTMLElement) {
  const columns = [...scene.querySelectorAll("[data-day]")];
  const column = columns.findIndex((col) => col.contains(card));
  const heads = scene.querySelectorAll<HTMLElement>('[data-tally="column"]');
  return [heads[column], scene.querySelector<HTMLElement>('[data-tally="day"]')].filter(
    (n): n is HTMLElement => !!n,
  );
}

/** How long the phone waits for the visitor before the tour carries on by itself. */
const VISITOR_WAIT_MS = 20_000;
const VISITOR_LOOK_MS = 4500;

/** The visitor picks the time; the rest happens for them, and the booking lands where they chose. */
async function visitorAct(c: Cast) {
  const { director, phone, finger } = c;
  c.chapter("book");
  c.demo().pickService(BOOKED_SERVICE);
  c.handOver(true);
  let waited = 0;
  while (c.demo().step !== "review" && waited < VISITOR_WAIT_MS) {
    await director.sleep(100);
    waited += 100;
  }
  c.handOver(false);
  if (c.demo().step !== "review") {
    resetAct(c);
    return;
  }
  await director.sleep(BEAT.pick);
  await landBooking(
    c,
    async (look) => tap(finger, phone, await find(director, look), director),
    c.demo().time ?? BOOKED_AT,
  );
  await director.sleep(VISITOR_LOOK_MS);
  resetAct(c);
  await director.sleep(700);
}

/** The payoff: the owner asks, the assistant says what it would change, and with one tap the booking moves. */
export async function assistantAct(c: Cast, onMoved?: (card: HTMLElement) => Promise<void>) {
  const { director, phone, finger, scene } = c;
  c.chapter("ai");
  c.notify(false);
  c.chat(0);
  await director.sleep(AI_BEAT.asked);
  c.chat(1);
  await director.sleep(AI_BEAT.proposal);
  await tap(finger, phone, await find(director, () => button(phone, "Move booking")), director);
  c.chat(2);
  await director.sleep(AI_BEAT.approving);
  const before = await find(director, () => findCard(scene));
  const was = before.getBoundingClientRect();
  c.setMoved();
  // Answered at once, so the old card goes and the new one comes within a frame or two.
  const card = await new Promise<HTMLElement>((found) => {
    const look = () => {
      const now = findCard(scene);
      if (now && now !== before) found(now);
      else requestAnimationFrame(look);
    };
    look();
  });
  c.chat(3);
  await flyToCard(card, scene, c.scale(), director, was);
  c.notify("moved");
  await onMoved?.(card);
  await director.sleep(AI_BEAT.done);
}

/** Puts everything back for the next time round. */
export function resetAct(c: Cast) {
  c.notify(false);
  c.chat(null);
  c.setBooked(false);
  c.demo().reset();
}

export type TourCast = Cast & {
  pointer: Pointer;
  go: (screen: Screen) => void;
  /** Builds a screen ahead of the click that opens it. */
  prepare: (screen: Screen) => void;
  /** Fetches the other screens ahead of the clicks that open them. */
  prepareLater: () => void;
};

/**
 * What a business owner sees in under a minute: a booking arrives, they open it, and it's already in today's list, the
 * customers and the reports. Back on the calendar they ask their assistant to change it, and it does.
 */
export async function tourStory(c: TourCast, entry: Entry = "book") {
  const { director, scene, pointer } = c;
  const q = <T extends Element>(selector: string) => find(director, () => scene.querySelector<T>(selector));
  const rail = (key: string) => q<HTMLElement>(`[data-rail="${key}"]`);
  /** Moves to a rail item, clicks it, and gives the new screen time to be read. */
  const open = async (screen: Screen, read: number, then?: () => void) => {
    await pointer.moveTo(await rail(screen));
    await director.sleep(240);
    await pointer.press();
    c.go(screen);
    then?.();
    await director.sleep(read);
  };

  /** From the booking on the calendar to the owner's assistant having moved it. */
  const afterBooking = async () => {
    c.prepareLater();
    preloadChat();
    await director.sleep(900);

    // The owner opens what just arrived.
    c.chapter("day");
    const card = await find(director, () => findCard(scene));
    await pointer.moveTo(card);
    await director.sleep(650);
    await pointer.press();
    c.notify(false);
    card.click();
    c.prepare("overview");
    await director.sleep(2300);
    await pointer.click(await q('[data-tour="close"]'));
    await director.sleep(500);

    // It's already in the day's list.
    await open("overview", 800);
    const row = await find(director, () =>
      [...(scene.querySelector('[data-screen="overview"]')?.querySelectorAll("li button") ?? [])].find((b) =>
        b.textContent.includes(CLIENT.name),
      ),
    );
    await pointer.moveTo(row);
    c.prepare("customers");
    await director.sleep(1300);

    // And among the customers, with what they've spent coming through in the reports.
    await open("customers", 500);
    const person = await find(director, () =>
      [...(scene.querySelector('[data-screen="customers"]')?.querySelectorAll("tbody tr") ?? [])].find((r) =>
        r.textContent.includes(CLIENT.name),
      ),
    );
    await pointer.moveTo(person);
    c.prepare("reports");
    await director.sleep(1000);
    await open("reports", 500);
    await pointer.moveTo(await q('[data-screen="reports"] h1'));
    await director.sleep(1400);

    // Back to the calendar, where the assistant takes over.
    await open("calendar", 500);
    await assistantPart();
  };
  /** The assistant moves the booking, then it's all as it was, and round again. */
  const assistantPart = async () => {
    await pointer.moveTo(await find(director, () => findCard(scene)));
    preloadChat();
    await assistantAct(c, (moved) => pointer.moveTo(moved));
    resetAct(c);
    await director.sleep(700);
  };

  // Parked in the day, out of the booking's way, watching.
  await pointer.enter({ x: scene.clientWidth * 0.5, y: scene.clientHeight * 0.66 });
  if (entry === "visitor") await visitorAct(c);
  if (entry === "day" || entry === "ai") {
    c.demo().finish();
    c.setBooked(true);
    if (entry === "day") await afterBooking();
    else await assistantPart();
  }
  for (;;) {
    await bookingAct(c);
    await afterBooking();
  }
}
