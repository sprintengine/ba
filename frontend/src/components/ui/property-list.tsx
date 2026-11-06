import { cn } from "@/lib/utils";

/** A record's facts as label and value rows: read first, with editing a step of its own. */
export function PropertyList({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("flex flex-col divide-y divide-border-subtle", className)} {...props} />;
}

export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-2.5 text-sm first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Where a record has nothing yet. */
export const NotSet = ({ children = "Not added" }: { children?: React.ReactNode }) => (
  <span className="text-subtle-foreground">{children}</span>
);
