/**
 * The shadow model against the server (`state-consistency`): a booking the bots know must have the status, start and
 * amount paid they left it with, or what it may have become on its own. Used by the checker and by bots that look.
 */
import type { BookingStatus } from "@shared/api/types";
import type { Sim } from "./runtime";
import { selfTransitions, type SimBooking } from "./shadow";

export type ServerBooking = {
  status: BookingStatus;
  start: string;
  end: string;
  holdExpiresAt: string | null;
  amountPaidCents: number;
  resources: { id: string }[];
};

/**
 * Compares [known] with [server], which was read after [readFrom] (ms). Returns false without judging when a bot
 * changed the booking since then (the read may predate the change); otherwise reports any difference and takes the
 * server's view, so one difference is reported once rather than at every later look.
 */
export function compareWithServer(
  sim: Sim,
  known: SimBooking,
  server: ServerBooking,
  readFrom: number,
): boolean {
  if (known.busy > 0 || known.changedAt >= readFrom) return false;
  const context = { bookingId: known.id, businessId: known.businessId };
  if (!selfTransitions(known.status, known.end, Date.now()).includes(server.status)) {
    sim.violate(
      "state-consistency",
      `booking ${known.id} is ${server.status}, last seen ${known.status} and no bot changed it`,
      context,
    );
  }
  if (Date.parse(server.start) !== Date.parse(known.start)) {
    sim.violate(
      "state-consistency",
      `booking ${known.id} starts ${server.start}, the bots left it at ${known.start}`,
      context,
    );
  }
  const paid = known.paidOnlineCents + known.paidInPersonCents;
  if (server.amountPaidCents !== paid) {
    sim.violate(
      "state-consistency",
      `booking ${known.id} shows ${server.amountPaidCents} paid, the bots paid ${paid}`,
      context,
    );
  }
  sim.world.sync(known, { ...server, resourceIds: server.resources.map((r) => r.id) }, false);
  return true;
}
