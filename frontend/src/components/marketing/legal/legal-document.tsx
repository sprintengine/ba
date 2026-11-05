import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Container, Eyebrow } from "../section";
import { LegalToc } from "./legal-toc";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Inline marker for details that must be filled in before publication. */
export function Tbc({ children = "To be confirmed" }: { children?: React.ReactNode }) {
  return (
    <mark className="rounded-sm bg-warning-soft px-1 py-0.5 text-[0.9em] font-medium text-warning-soft-foreground">
      [{children}]
    </mark>
  );
}

/**
 * Long-form legal page: title, prominent DRAFT notice, sticky table of contents
 * on desktop (collapsible on mobile), numbered sections in a readable measure.
 */
export function LegalDocument({
  title,
  summary,
  sections,
  related,
}: {
  title: string;
  summary: React.ReactNode;
  sections: LegalSection[];
  related: { href: string; label: string };
}) {
  const toc = sections.map(({ id, title }) => ({ id, title }));
  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <header className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{summary}</p>
      </header>

      <div
        role="note"
        aria-label="Draft notice"
        className="mt-6 flex max-w-3xl gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground"
      >
        <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Draft, not legally binding.</span> It hasn&rsquo;t been reviewed by
          a solicitor and creates no rights or obligations. Items marked{" "}
          <span className="font-semibold">[To be confirmed]</span> will be completed before launch.
        </p>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <LegalToc items={toc} />
            <p className="mt-8 border-t border-border-subtle pt-5 text-sm text-muted-foreground">
              See also{" "}
              <Link
                href={related.href}
                className="text-brand underline underline-offset-4 hover:decoration-2"
              >
                {related.label}
              </Link>
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          <details className="group mb-10 rounded-xl border border-border bg-surface lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              On this page
              <ChevronDown className="size-4 text-subtle-foreground transition-transform group-open:rotate-180" />
            </summary>
            <ol className="border-t border-border-subtle px-4 py-3 text-sm">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex gap-2 py-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <span className="tnum w-4 text-subtle-foreground">{i + 1}</span>
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          <article className="max-w-[68ch] text-[0.9375rem] leading-7 text-foreground/90 [&_a]:text-brand [&_a]:underline-offset-4 [&_a:hover]:underline [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-2 [&_li]:pl-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-4 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-subtle-foreground">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24 border-t border-border-subtle pt-10 pb-2 first:border-t-0 first:pt-0"
              >
                <h2
                  id={`${s.id}-title`}
                  className="flex gap-3 text-xl font-semibold tracking-tight text-foreground"
                >
                  <span className="tnum text-subtle-foreground">{i + 1}.</span>
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
