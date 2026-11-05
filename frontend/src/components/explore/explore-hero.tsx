import { Container } from "@/components/marketing/section";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCardSkeleton } from "./listing-card";

/** Server-rendered page heading for the `/explore` routes (the H1 is in the initial HTML). */
export function ExploreHero({ title, description }: { title: string; description: string }) {
  return (
    <section className="relative overflow-hidden border-b border-border-subtle">
      <Container className="relative flex flex-col gap-2 pt-8 pb-6 lg:pt-10 lg:pb-8">
        <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
        <p className="max-w-2xl text-base text-muted-foreground">{description}</p>
      </Container>
    </section>
  );
}

/** Page frame shared by the `/explore` routes: hero + the client explorer (or its fallback). */
export function ExploreLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ExploreHero title={title} description={description} />
      <Container className="py-6 sm:py-8">{children}</Container>
    </>
  );
}

/** Suspense fallback while the client explorer reads the URL. */
export function ExploreFallback() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-5">
      <Skeleton className="h-9 rounded-lg" />
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <Skeleton className="hidden h-64 rounded-xl lg:block" />
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
