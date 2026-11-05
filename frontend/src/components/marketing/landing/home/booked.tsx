import { PrismContainer, PrismHeading } from "../heading";
import { BookedSceneLoader } from "./booked-scene-loader";

/** What the product does, in one picture: the client's phone, then the business's calendar. */
export function BookedSection() {
  return (
    <section id="product" aria-labelledby="product-title" className="scroll-mt-20 pt-4 pb-24 sm:pb-32">
      <PrismContainer className="max-w-[80rem]">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
          <PrismHeading
            id="product-title"
            align="left"
            className="max-w-none"
            label="How it works"
            title="They book on their phone."
            lit="You see it on your calendar."
          />
          <p className="text-base leading-[1.6] text-muted-foreground sm:text-lg lg:pb-1">
            Clients pick a free time and pay online, and it shows up on your calendar straight away. No phone
            calls, nothing to type in.
          </p>
        </div>
        <div className="mt-8 sm:mt-10 lg:mt-8">
          <BookedSceneLoader />
        </div>
        <p className="sr-only">
          A client picks a follow-up treatment on their phone, chooses 15:30 and pays €60. The booking leaves
          the phone and lands straight away on the business&apos;s calendar, in Sam&apos;s column. The phone
          is a working demo.
        </p>
      </PrismContainer>
    </section>
  );
}
