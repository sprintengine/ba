/** A titled card of the service editor, as in Settings, with an optional action (e.g. "Add option") on the right. */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">{children}</div>
    </section>
  );
}
