"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useDemoTarget } from "../../engine/demo-context";
import type { DemoService } from "../state";

function ServiceRow({ s }: { s: DemoService }) {
  return (
    <li
      className={cn(
        "flex items-center gap-4 px-4 py-3.5 transition-colors duration-700",
        s.fresh && "bg-brand-soft/70",
      )}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{s.name}</span>
        <span className="tnum flex items-center gap-x-2 text-xs text-muted-foreground">
          <span>{s.duration}</span>
          <span>·</span>
          <span className="font-medium text-foreground">{s.price}</span>
          <span>·</span>
          <span>Prepaid</span>
          {s.options ? (
            <>
              <span>·</span>
              <span>{s.options} options</span>
            </>
          ) : null}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-4">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Public <Switch size="sm" checked tabIndex={-1} />
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Active <Switch size="sm" checked tabIndex={-1} />
        </span>
        <span className="flex size-8 items-center justify-center rounded-md text-muted-foreground">
          <Pencil className="size-4" />
        </span>
      </div>
    </li>
  );
}

/** Services, grouped by category, as in the dashboard. */
export function ServicesScreen({ services }: { services: DemoService[] }) {
  const add = useDemoTarget("new-service");
  const groups = [...new Set(services.map((s) => s.category))];
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex items-end justify-between gap-4 pb-6">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-semibold tracking-tight">Services</p>
          <p className="text-sm text-muted-foreground">
            What people can book, how long it takes and what it costs.
          </p>
        </div>
        <Button
          {...add.props}
          tabIndex={-1}
          variant="primary"
          className={cn(add.hovered && "bg-primary-hover", add.pressed && "scale-[0.98]")}
        >
          <Plus /> New service
        </Button>
      </header>
      <div className="flex flex-col gap-8">
        {groups.map((cat) => (
          <section key={cat} className="flex flex-col gap-2">
            <p className="px-1 text-xs font-medium tracking-wide text-subtle-foreground uppercase">{cat}</p>
            <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
              {services
                .filter((s) => s.category === cat)
                .map((s) => (
                  <ServiceRow key={s.id} s={s} />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
