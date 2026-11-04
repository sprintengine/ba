"use client";

import { Accordion } from "radix-ui";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqItem = { question: string; answer: React.ReactNode };

/** Accessible FAQ list (Radix accordion, multiple open). */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <Accordion.Root
      type="multiple"
      className={cn("divide-y divide-border border-y border-border", className)}
    >
      {items.map((item, i) => (
        <Accordion.Item key={item.question} value={`q${i}`} className="group">
          <Accordion.Header asChild>
            <h3>
              <Accordion.Trigger className="focus-ring flex w-full items-center justify-between gap-6 rounded-md py-5 text-left text-base font-medium tracking-tight transition-colors hover:text-foreground/80">
                {item.question}
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-[transform,background-color,color] duration-200 group-data-[state=open]:rotate-45 group-data-[state=open]:bg-foreground group-data-[state=open]:text-background"
                >
                  <Plus className="size-3.5" />
                </span>
              </Accordion.Trigger>
            </h3>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden text-sm text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down sm:text-base sm:leading-7">
            <div className="max-w-2xl pb-6 [&_a]:text-brand [&_a]:underline-offset-4 [&_a:hover]:underline [&_p+p]:mt-3">
              {item.answer}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
