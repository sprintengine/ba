/**
 * `run` (the simulation), `replay` (a run again from its seed and options, one action at a time) and `check` (the
 * invariants once over the businesses a run's log names, without bots). docs/simulation.md has the details.
 */
import { readFileSync } from "node:fs";
import { resourcesApi } from "@shared/api/resources";
import { servicesApi } from "@shared/api/services";
import { authFor, type SimIdentity } from "./auth";
import { Checker } from "./checker";
import { runAs } from "./http";
import { parseOptions, replayOptions, USAGE, type Options } from "./options";
import { payerFor } from "./payer";
import { run } from "./run";
import { Sim } from "./runtime";
import { parseLog } from "./trail";

function recordedRun(path: string) {
  const entries = parseLog(readFileSync(path, "utf8"));
  const header = entries.find((e) => e.type === "run");
  if (!header) throw new Error(`${path} has no run header: is it a simulation log?`);
  return { options: header.options as Partial<Options>, entries };
}

/** Rebuilds the businesses a log names (as their owners see them now), for `check`. */
async function loadBusinesses(sim: Sim, entries: ReturnType<typeof parseLog>) {
  for (const e of entries.filter((x) => x.type === "note" && x.note === "business")) {
    const ownerId = e.owner as SimIdentity;
    const id = String(e.id);
    await runAs({ token: sim.token(ownerId), actor: "checker", seq: 0, businessId: id }, async () => {
      const [services, resources] = await Promise.all([servicesApi.list(id), resourcesApi.list(id)]);
      sim.world.addBusiness({
        key: String(e.key),
        id,
        slug: String(e.slug),
        name: String(e.slug),
        timeZone: String(e.timeZone),
        owner: ownerId,
        policies: { maxAdvanceDays: 60 } as Sim["world"]["businesses"][number]["policies"],
        resources: new Map(
          resources.map((r) => [
            r.id,
            {
              id: r.id,
              name: r.name,
              active: r.isActive,
              rules: [],
              overrideIds: new Map(),
              memberId: r.memberId,
            },
          ]),
        ),
        services: new Map(services.map((s) => [s.id, s])),
        closures: new Map(),
        members: new Map(),
        configVersion: 0,
        configBusy: 0,
        limitScenario: e.key === "limit",
        cappedMonth: null,
        cappedAt: null,
        dormant: false,
        // The checker books nothing: whether it took online payments doesn't matter here.
        onlinePayments: true,
      });
    });
  }
}

async function main(): Promise<number> {
  let options = parseOptions(process.argv.slice(2));
  if (options.command === "replay") {
    if (options.fromLog) options = replayOptions(options, recordedRun(options.fromLog).options);
    else if (!options.seedGiven) throw new Error("replay needs --from-log PATH or --seed SEED");
  }
  const sim = new Sim(options, authFor(options.auth), payerFor(options.payments, options.stripeShare));
  if (options.command === "check") {
    if (!options.fromLog)
      throw new Error("check needs --from-log PATH (the log of the run whose businesses to check)");
    const { entries } = recordedRun(options.fromLog);
    await loadBusinesses(sim, entries);
    // Jobs are judged from the run's start, not the check's.
    const header = entries.find((e) => e.type === "run");
    const checker = new Checker(sim, header ? new Date(header.t) : new Date());
    await checker.run(true);
    await checker.close();
    await sim.log.close();
    const failing = sim.violations.failing(options.strict);
    process.stdout.write(
      `Checked ${sim.world.businesses.length} businesses: ${sim.violations.list.length} violations, ${failing.length} failing.\n`,
    );
    return failing.length === 0 ? 0 : 1;
  }
  return (await run(sim)) ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    process.exit(2);
  },
);
