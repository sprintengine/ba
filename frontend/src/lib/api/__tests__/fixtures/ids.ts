/** Stable, readable UUIDs for API fixtures (the spec says ids are UUIDs, and the contract test checks formats). */
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const ids = {
  business: uuid(1),
  user: uuid(2),
  member: uuid(3),
  resource: uuid(10),
  resource2: uuid(11),
  room: uuid(12),
  service: uuid(20),
  option: uuid(21),
  addon: uuid(22),
  requirement: uuid(23),
  question: uuid(30),
  question2: uuid(31),
  group: uuid(40),
  customer: uuid(50),
  booking: uuid(60),
  payment: uuid(61),
  audit: uuid(62),
  offer: uuid(70),
  releaseSchedule: uuid(80),
} as const;
