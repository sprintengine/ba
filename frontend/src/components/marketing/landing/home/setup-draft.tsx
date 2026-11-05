"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AiBadge } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDescription } from "@/components/onboarding/draft-storage";
import { IPhone } from "./iphone";

const SENTENCE = "A physio clinic in Dublin. Three physios, three rooms and a rehab gym.";
const DRAFT: { label: string; value: string }[] = [
  { label: "Services", value: "Initial assessment, follow-up, sports massage" },
  { label: "Hours", value: "Mon to Sat, 09:00 to 18:00" },
  { label: "Team", value: "Sam, Aoife and Niamh" },
  { label: "Rooms", value: "Rooms 1 to 3, rehab gym" },
];

/** The booking page the draft makes, as a phone shows it: the real page, in its own chunk. */
const DraftPage = dynamic(() => import("./setup-page").then((m) => m.SetupPage), {
  ssr: false,
  loading: () => <IPhone time="15:14" />,
});

/** One sentence becoming a setup and a booking page, and a box to try your own: its words carry through sign-up. */
export function SetupDraft() {
  const router = useRouter();
  const [own, setOwn] = useState("");
  return (
    <div className="mt-12 grid gap-8 sm:mt-14 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col justify-center">
        <p className="text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.2] font-medium tracking-[-0.025em]">
          “{SENTENCE}”
        </p>
        <AiBadge className="mt-5 text-[0.9375rem]">Drafted from that one sentence</AiBadge>
        <form
          className="mt-8 flex gap-2 max-sm:flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            saveDescription(own);
            router.push("/sign-up");
          }}
        >
          <Input
            aria-label="Describe your business"
            placeholder="Describe yours, or paste your website"
            value={own}
            maxLength={2000}
            onChange={(e) => setOwn(e.target.value)}
            className="h-12 rounded-[14px] bg-surface sm:flex-1"
          />
          <Button type="submit" variant="primary" size="xl" className="rounded-[14px] font-semibold">
            Set mine up <ArrowRight />
          </Button>
        </form>
      </div>
      <div className="flex items-center gap-6 [--iphone-scale:0.46] sm:gap-8">
        <div aria-hidden inert className="max-sm:hidden">
          <DraftPage />
        </div>
        <div className="min-w-0 flex-1" aria-label="Your draft">
          <dl className="flex flex-col">
            {DRAFT.map((d) => (
              <div
                key={d.label}
                className="border-b border-border-subtle py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <dt className="text-sm text-muted-foreground">{d.label}</dt>
                <dd className="mt-0.5 font-medium">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
