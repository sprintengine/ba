import { IndustryCards } from "../industry-cards";
import { PrismContainer, PrismHeading } from "./heading";

/** Starting templates per trade, and anything else bookable. */
export function IndustriesSection() {
  return (
    <section id="industries" aria-labelledby="industries-title" className="scroll-mt-24 pb-24 sm:pb-32">
      <PrismContainer>
        <PrismHeading
          id="industries-title"
          label="Templates"
          title="Start from a template"
          lit="for your kind of business."
          lead="Each one comes with the usual services, prices and booking questions, and you can change any of them. Or skip it and just describe what you do."
        />
        <div className="mt-14 sm:mt-16">
          <IndustryCards swipe />
        </div>
      </PrismContainer>
    </section>
  );
}
