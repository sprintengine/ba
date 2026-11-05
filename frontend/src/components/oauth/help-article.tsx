import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Eyebrow } from "@/components/marketing/section";
import { LegalToc } from "@/components/marketing/legal/legal-toc";

export type HelpSection = { id: string; title: string; body: React.ReactNode };

/** Prose styles for long-form help (mirrors the legal documents' measure and rhythm). */
const PROSE = cn(
  "max-w-[68ch] text-[0.9375rem] leading-7 text-foreground/90",
  "[&_a]:text-brand [&_a]:underline-offset-4 [&_a:hover]:underline",
  "[&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_li]:mt-2 [&_li]:pl-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-4",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-subtle-foreground",
);

/** Long-form customer help page: title, lead, sticky contents on desktop (collapsible on mobile), sections. */
export function HelpArticle({
  title,
  lead,
  sections,
}: {
  title: string;
  lead: React.ReactNode;
  sections: HelpSection[];
}) {
  const toc = sections.map(({ id, title }) => ({ id, title }));
  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <header className="max-w-3xl">
        <Eyebrow>Help</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{lead}</p>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <LegalToc items={toc} />
          </div>
        </aside>

        <div className="min-w-0">
          <details className="group mb-10 rounded-xl border border-border bg-surface lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              On this page
              <ChevronDown className="size-4 text-subtle-foreground transition-transform group-open:rotate-180" />
            </summary>
            <ol className="border-t border-border-subtle px-4 py-3 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block py-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          <article className={PROSE}>
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24 border-t border-border-subtle pt-10 pb-2 first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-title`} className="text-xl font-semibold tracking-tight text-foreground">
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </div>
    </Container>
  );
}

/** A menu path or button name, e.g. <MenuPath>Customize › Connectors</MenuPath>. */
export function MenuPath({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-muted box-decoration-clone px-1.5 py-0.5 text-[0.875em] font-medium text-foreground">
      {children}
    </span>
  );
}

/** A soft callout inside help prose. */
export function HelpNote({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div
      role="note"
      className={cn(
        "mt-5 rounded-xl border px-4 py-3 text-sm leading-6 [&_p]:mt-0",
        tone === "info"
          ? "border-info-border bg-info-soft text-info-soft-foreground"
          : "border-warning-border bg-warning-soft text-warning-soft-foreground",
      )}
    >
      {children}
    </div>
  );
}
