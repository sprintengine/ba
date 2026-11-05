import { PrismContainer, PrismHeading } from "../heading";
import { BookedSceneLoader } from "./booked-scene-loader";

/** What the product does, in one picture: the business's calendar, with a client's booking arriving on it. */
export function BookedSection() {
  return (
    <section id="product" aria-labelledby="product-title" className="scroll-mt-20 pb-24 sm:pb-32">
      <PrismContainer>
        <BookedSceneLoader>
          <PrismHeading
            id="product-title"
            align="left"
            className="max-w-none"
            label="How it works"
            title="Your day, on one calendar."
            lit="Bookings arrive while you work."
            lead="Clients pick a free time and pay online. It lands on your calendar, paid, with the reminder already set. No phone calls, nothing to type in."
          />
        </BookedSceneLoader>
        <p className="sr-only">
          The calendar shows a clinic’s afternoon across three people. A client books a follow-up treatment at
          15:30 on their phone and pays €60, and the booking lands straight away in Sam’s column. The phone is
          a working demo.
        </p>
      </PrismContainer>
    </section>
  );
}
