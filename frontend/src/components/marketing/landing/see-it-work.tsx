import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { assistantMarketed } from "@/lib/assistant/flag";
import { cn } from "@/lib/utils";
import { OwnerDemo } from "../demo/owner/owner-demo";
import { PrismContainer, PrismHeading } from "./heading";
import s from "./prism/prism.module.css";

/** Straight after the story: the real dashboard, playing on its own over the light. */
export function SeeItWorkSection() {
  return (
    <section id="demo" aria-labelledby="demo-title" className="scroll-mt-24 pt-24 sm:pt-32">
      <PrismContainer>
        <PrismHeading
          id="demo-title"
          label="See it work"
          title="Watch a clinic get set up"
          lit="and take its first booking."
          lead={
            // The demo only plays Bo's chapter where Bo is offered (see ownerChapters).
            assistantMarketed()
              ? `A physio clinic adds a service, opens on Saturday mornings, takes a paid booking online and asks ${ASSISTANT_NAME} for help. Pick a step or let it play.`
              : "A physio clinic adds a service, opens on Saturday mornings and takes a paid booking online. Pick a step or let it play."
          }
        />
        <div className="relative mt-12 sm:mt-16">
          <div aria-hidden className={cn(s.glow, "top-[45%] h-[60%] w-[110%]")} />
          <OwnerDemo className="relative" />
        </div>
      </PrismContainer>
    </section>
  );
}
