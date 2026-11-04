"use client";

import Link from "next/link";
import { useQuestions } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SensitiveMark } from "../../common";
import { Section } from "./section";

/** The questions asked for this service (managed in Settings → Questions). */
export function QuestionsSection({ serviceId }: { serviceId: string }) {
  const business = useCurrentBusiness();
  const questions = useQuestions(business.id);
  const list = (questions.data ?? []).filter(
    (q) => q.isActive && (q.serviceId === null || q.serviceId === serviceId),
  );
  return (
    <Section
      title="Questions"
      description="What people are asked when they book this service."
      action={
        <Button asChild size="xs" variant="secondary">
          <Link href={dashboardHref(business.slug, "settings/questions")}>Manage questions</Link>
        </Button>
      }
    >
      {list.length === 0 ? (
        <p className="text-sm text-subtle-foreground">No questions — just name and contact details.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {list.map((q) => (
            <li key={q.id} className="flex items-center gap-2">
              <span>{q.label}</span>
              {q.required && <Badge className="h-5">Required</Badge>}
              {q.sensitive && <SensitiveMark />}
              <span className="ml-auto text-xs text-subtle-foreground">
                {q.serviceId ? "This service" : "All services"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
