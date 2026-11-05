import { PrismContainer, PrismHeading } from "./heading";
import { BusinessExamples } from "./examples/business-examples";

/** Every kind of appointment on every plan: real calendars for real kinds of business, each one working. */
export function IndustriesSection() {
  return (
    <section id="industries" aria-labelledby="industries-title" className="scroll-mt-24 pb-24 sm:pb-32">
      <PrismContainer>
        <PrismHeading
          id="industries-title"
          label="Examples"
          title="Every kind of appointment."
          lit="On every plan."
          lead="Add as many appointment types as you need, each with its own length and price, and choose which staff do which. Open a business and watch it work."
        />
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
