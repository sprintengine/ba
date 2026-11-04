"use client";

import { Logo, LogoMark, Wordmark } from "@/components/brand/logo";
import { Card } from "@/components/ui/card";
import { Section } from "./section";

export function BrandSection() {
  return (
    <Section id="brand" title="Brand" description="Wordmark and mark (src/components/brand).">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="items-center justify-center p-8">
          <Logo size="lg" />
        </Card>
        <Card className="items-center justify-center gap-4 p-8 sm:flex-row">
          <LogoMark className="size-12" />
          <LogoMark className="size-8" />
          <LogoMark className="size-5" />
          <LogoMark className="size-4" />
        </Card>
        <Card className="items-center justify-center bg-gray-950 p-8 text-gray-50 dark:bg-gray-50 dark:text-gray-950">
          <Wordmark className="h-6" />
        </Card>
      </div>
    </Section>
  );
}
