"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDescription } from "@/components/onboarding/draft-storage";
import { cn } from "@/lib/utils";

/** A box to describe your business: its words carry through sign-up into the draft. */
export function DescribeForm({ cta, className }: { cta: string; className?: string }) {
  const router = useRouter();
  const [own, setOwn] = useState("");
  return (
    <form
      className={cn("flex gap-2 max-sm:flex-col", className)}
      onSubmit={(e) => {
        e.preventDefault();
        saveDescription(own);
        router.push("/sign-up");
      }}
    >
      <Input
        aria-label="Describe your business"
        placeholder="Describe yours, or paste a link"
        value={own}
        maxLength={2000}
        onChange={(e) => setOwn(e.target.value)}
        className="h-12 rounded-[14px] bg-surface sm:flex-1"
      />
      <Button type="submit" variant="primary" size="xl" className="rounded-[14px] font-semibold">
        {cta} <ArrowRight />
      </Button>
    </form>
  );
}
