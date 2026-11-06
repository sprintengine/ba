import { BOOKED_AT, BOOKED_SERVICE, CLIENT } from "../fixture";
import { flyToCard } from "../flight";
import type { BookingDemo } from "../use-booking-demo";
import { tap } from "./cursor";
import type { Pointer } from "./cursor";
import type { Director } from "./director";
import type { Screen } from "./tour-app";

/** Everything the script touches. It works the real controls, so it keeps working when they change. */
export type Cast = {
  director: Director;
  /** The panel: everything on stage is placed against it. */
  scene: HTMLElement;
  /** The phone's screen, and the fingertip on it. */
  phone: HTMLElement;
  finger: HTMLElement;
  demo: () => BookingDemo;
  /** Puts the booking on the calendar, or takes it off. */
  setBooked: (booked: boolean) => void;
  /** Shows the "new booking" notice, or clears it. */
  notify: (on: boolean) => void;
  /** How much the calendar is drawn down. */
  scale: () => number;
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

/** The page's core story: the client's tap on the phone puts the card on the business's calendar. */
export async function bookingAct(c: Cast) {
  const { director, phone, finger } = c;
  const press = async (look: () => HTMLElement | null | undefined) =>
    tap(finger, phone, await find(director, look), director);

  await director.sleep(BEAT.read);
  await press(() => button(phone, BOOKED_SERVICE.name));
  await director.sleep(BEAT.pick);
  await press(() => button(phone, BOOKED_AT));
  await director.sleep(BEAT.pick);
  await press(() => phone.querySelector<HTMLElement>('[data-demo="pay"]'));
  await director.sleep(BEAT.paying);
  c.demo().confirm();
  await director.sleep(BEAT.settled);
  c.setBooked(true);
  const card = await find(director, () => findCard(c.scene));
  await flyToCard(card, c.scene, c.scale(), director);
  c.notify(true);
}

/** Puts everything back for the next time round. */
export function resetAct(c: Cast) {
  c.notify(false);
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
 * What a business owner sees in half a minute: a booking arrives, they open it, and it's already in today's list, the
 * customers and the reports. It ends where it began, on the calendar.
 */
export async function tourStory(c: TourCast) {
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

  // Parked in the day, out of the booking's way, watching.
  await pointer.enter({ x: scene.clientWidth * 0.5, y: scene.clientHeight * 0.66 });
  for (;;) {
    await bookingAct(c);
    c.prepareLater();
    await director.sleep(1500);

    // The owner opens what just arrived.
    const card = await find(director, () => findCard(scene));
    await pointer.moveTo(card);
    await director.sleep(650);
    await pointer.press();
    c.notify(false);
    card.click();
    c.prepare("overview");
    await director.sleep(3400);
    await pointer.click(await q('[data-tour="close"]'));
    await director.sleep(500);

    // It's already in the day's list.
    await open("overview", 1100);
    const row = await find(director, () =>
      [...(scene.querySelector('[data-screen="overview"]')?.querySelectorAll("li button") ?? [])].find((b) =>
        b.textContent.includes(CLIENT.name),
      ),
    );
    await pointer.moveTo(row);
    c.prepare("customers");
    await director.sleep(2200);

    // And among the customers, with what they've spent coming through in the reports.
    await open("customers", 900);
    const person = await find(director, () =>
      [...(scene.querySelector('[data-screen="customers"]')?.querySelectorAll("tbody tr") ?? [])].find((r) =>
        r.textContent.includes(CLIENT.name),
      ),
    );
    await pointer.moveTo(person);
    c.prepare("reports");
    await director.sleep(2000);
    await open("reports", 3400);

    // Back to the calendar, as it was, and round again.
    await open("calendar", 700, () => resetAct(c));
  }
}
