/** A numbered section of the new-booking form. */
export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="tnum flex size-5 items-center justify-center rounded-full bg-muted text-2xs text-muted-foreground">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
