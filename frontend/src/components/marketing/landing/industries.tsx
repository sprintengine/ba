import { PrismContainer, PrismDot } from "./heading";
import { BusinessExamples } from "./examples/business-examples";
import { AnythingStage } from "./homepage/anything-stage";

const KINDS = [
  "Haircuts",
  "physio",
  "car washes",
  "piano lessons",
  "GP visits",
  "dog grooming",
  "driving lessons",
  "tattoos",
  "massages",
  "tutoring",
];

/** Book anything: endless kinds of appointment, leading into real calendars for real kinds of business, each working. */
export function IndustriesSection() {
  return (
    <section
      id="industries"
      aria-labelledby="industries-title"
      className="scroll-mt-24 overflow-x-clip pt-6 pb-24 sm:pb-32"
    >
      <PrismContainer>
        <AnythingStage>
          <p className="mb-3.5 text-[0.9375rem] font-semibold text-muted-foreground">Examples</p>
          <h2
            id="industries-title"
            className="text-[clamp(2.75rem,5.6vw,5rem)] leading-[0.98] font-semibold tracking-[-0.05em]"
          >
            Book anything
            <PrismDot />
          </h2>
          <p className="mt-5 max-w-[32rem] text-base leading-[1.6] text-muted-foreground sm:text-lg">
            If people book time with you, it works here, with as many kinds of appointment as you need.
          </p>
          <p className="mt-3 max-w-[32rem] text-base leading-[1.6] font-medium sm:text-lg">
            {KINDS.join(", ")}.
          </p>
        </AnythingStage>
        <div className="mt-14 sm:mt-16">
          <BusinessExamples />
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          The photos are illustrations and the bookings are made up. The calendar is the real one.
        </p>
      </PrismContainer>
    </section>
  );
}
