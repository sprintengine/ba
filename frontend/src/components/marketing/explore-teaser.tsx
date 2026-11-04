import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Landing-page call to action for people looking to book (the commission-free marketplace at `/explore`). */
export function ExploreTeaser() {
  return (
    <div className="mx-auto w-full max-w-[74rem] px-4 sm:px-8">
      <aside
        aria-labelledby="explore-teaser-title"
        className="flex flex-col gap-5 rounded-[22px] border border-border bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:gap-6 sm:p-7"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-sunken text-foreground ring-1 ring-border-subtle [&_svg]:size-5">
          <Compass />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="explore-teaser-title" className="text-lg font-semibold tracking-tight">
            Looking to book something?
          </h2>
          <p className="text-sm leading-normal text-muted-foreground">
            Find physios, barbers, car washes, music lessons and more near you. See free times and deals, and
            book in a minute. Listing is opt-in and commission-free.
          </p>
        </div>
        <Button asChild variant="secondary" size="lg" className="rounded-xl font-semibold">
          <Link href="/explore">
            Explore businesses <ArrowRight />
          </Link>
        </Button>
      </aside>
    </div>
  );
}
