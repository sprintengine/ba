import { service } from "@shared/api/__tests__/fixtures/catalog";
import type { Service } from "@shared/api/types";
import {
  categoriesOf,
  moveId,
  reconcileOrder,
  reorderChanges,
  reorderRows,
  serviceBadges,
  serviceGroups,
  serviceRowLabel,
  serviceRows,
  serviceSummary,
  sortServices,
} from "./services";

const make = (id: string, patch: Partial<Service> = {}): Service => ({
  ...service,
  id,
  name: id,
  options: [],
  addons: [],
  ...patch,
});

describe("sortServices", () => {
  it("orders by sortOrder, then name", () => {
    const list = [make("b", { sortOrder: 1 }), make("c", { sortOrder: 0 }), make("a", { sortOrder: 1 })];
    expect(sortServices(list).map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});

describe("serviceGroups / serviceRows", () => {
  it("groups active services by category, uncategorised under Other, inactive apart", () => {
    const list = [
      make("a", { category: "Physio" }),
      make("b", { category: null }),
      make("c", { category: " Physio " }),
      make("d", { isActive: false }),
    ];
    const { entries, inactive } = serviceGroups(list);
    expect(entries.map(([title, l]) => [title, l.map((s) => s.id)])).toEqual([
      ["Physio", ["a", "c"]],
      ["Other", ["b"]],
    ]);
    expect(inactive.map((s) => s.id)).toEqual(["d"]);
  });

  it("gives a lone Other group no title", () => {
    const rows = serviceRows([make("a", { category: null }), make("b", { category: "" })]);
    expect(rows.map((r) => r.kind)).toEqual(["service", "service"]);
    expect(rows[0]).toMatchObject({ first: true, last: false, dashed: false });
    expect(rows[1]).toMatchObject({ first: false, last: true });
  });

  it("titles each group and the inactive ones (dashed)", () => {
    const rows = serviceRows([make("a", { category: "Physio" }), make("d", { isActive: false })]);
    expect(rows.map((r) => r.key)).toEqual(["h:Physio", "a", "h:inactive", "d"]);
    expect(rows[0]).toMatchObject({ kind: "header", title: "Physio", first: true });
    expect(rows[2]).toMatchObject({ kind: "header", title: "Inactive", first: false });
    expect(rows[3]).toMatchObject({ dashed: true, first: true, last: true });
  });

  it("titles Inactive as the first header when nothing is active", () => {
    expect(serviceRows([make("d", { isActive: false })])[0]).toMatchObject({
      title: "Inactive",
      first: true,
    });
  });
});

describe("categoriesOf", () => {
  it("lists the categories in use once, trimmed", () => {
    expect(
      categoriesOf([
        make("a", { category: "Physio " }),
        make("b", { category: "Physio" }),
        make("c", { category: null }),
        make("d", { category: "Massage" }),
      ]),
    ).toEqual(["Physio", "Massage"]);
  });
});

describe("reordering", () => {
  const a = make("a", { sortOrder: 0 });
  const b = make("b", { sortOrder: 1 });
  const c = make("c", { sortOrder: 2, isActive: false });

  it("lists every service in the edited order with its position", () => {
    const rows = reorderRows(new Map([a, b, c].map((s) => [s.id, s])), ["c", "a", "missing", "b"]);
    expect(rows.map((r) => r.key)).toEqual(["c", "a", "b"]);
    expect(rows[0]).toMatchObject({ dashed: true, first: true, position: { index: 0, count: 3 } });
    expect(rows[2]).toMatchObject({ last: true, position: { index: 2, count: 3 } });
  });

  it("keeps the edited order in step with the data", () => {
    expect(reconcileOrder(["b", "gone", "a"], [a, b, c])).toEqual(["b", "a", "c"]);
  });

  it("moves an id up or down, and not past the ends", () => {
    expect(moveId(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], -1, 1)).toEqual(["a", "b", "c"]);
  });

  it("changes nothing when the order is the same", () => {
    expect(reorderChanges([a, b, c], ["a", "b", "c"])).toEqual([]);
  });

  it("swaps just the two services moved", () => {
    expect(reorderChanges([a, b, c], ["b", "a", "c"]).map((x) => [x.service.id, x.sortOrder])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });

  it("separates equal sort orders so the order no longer depends on names", () => {
    const x = make("x", { sortOrder: 0 });
    const y = make("y", { sortOrder: 0 });
    expect(reorderChanges([x, y], ["y", "x"]).map((r) => [r.service.id, r.sortOrder])).toEqual([["x", 1]]);
  });
});

describe("serviceSummary", () => {
  it("reads length, price, payment, options and add-ons", () => {
    const parts = serviceSummary(service, "EUR", "en-IE");
    expect(parts[0]).toMatch(/min|h/);
    expect(parts).toContain("Deposit or at venue");
    expect(parts).toContain("1 option");
    expect(parts).toContain("1 add-on");
  });

  it("pluralises and skips the payment mode when the price already says Free", () => {
    const free = make("f", { paymentMode: "free", priceCents: 0, allowPayAtVenue: false });
    expect(serviceSummary(free, "EUR", "en-IE")).toEqual([expect.any(String), "Free"]);
    const many = make("m", {
      paymentMode: "at_venue",
      allowPayAtVenue: false,
      options: [service.options[0]!, { ...service.options[0]!, id: "o2" }],
      addons: [service.addons[0]!, { ...service.addons[0]!, id: "a2" }],
    });
    expect(serviceSummary(many, "EUR", "en-IE")).toEqual(
      expect.arrayContaining(["Pay at venue", "2 options", "2 add-ons"]),
    );
  });
});

describe("badges and the row's label", () => {
  it("says Private, Approval and seats", () => {
    const s = make("s", { isPublic: false, requiresApproval: true, capacity: 8 });
    expect(serviceBadges(s)).toEqual([
      { label: "Private", tone: "neutral" },
      { label: "Approval", tone: "info" },
      { label: "8 seats", tone: "neutral" },
    ]);
    expect(serviceBadges(make("p"))).toEqual([]);
  });

  it("reads name, badges, inactive and summary", () => {
    const s = make("Massage", { isActive: false, isPublic: false });
    expect(serviceRowLabel(s, ["60 min", "€50"])).toBe("Massage, Private, Inactive, 60 min, €50");
  });
});
