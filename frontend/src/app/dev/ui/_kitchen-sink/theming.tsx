"use client";

import Link from "next/link";
import { Bike, Car, Music, Stethoscope } from "lucide-react";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Section } from "./section";

const BRANDS = [
  { name: "Lumen Physiotherapy", color: "#0e7c70", icon: Stethoscope },
  { name: "Gleam Car Wash", color: "#1d4ed8", icon: Car },
  { name: "Cadence Music Studio", color: "#be185d", icon: Music },
  { name: "Pedal Studio", color: "#fde047", icon: Bike },
];

export function ThemingSection() {
  return (
    <Section
      id="theming"
      title="Per-business theming"
      description="BusinessThemeProvider maps a business's primaryColor onto --primary/--brand/--ring with WCAG-safe foregrounds. Note the pale yellow still gets readable text."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BRANDS.map(({ name, color, icon: Icon }) => (
          <BusinessThemeProvider key={name} primaryColor={color}>
            <Card className="gap-4 p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                  <Icon className="size-4.5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="font-mono text-2xs text-subtle-foreground">{color}</span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {["09:00", "09:30", "10:00"].map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      "tnum h-9 rounded-lg border text-sm font-medium transition-colors",
                      i === 1
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-brand hover:text-brand",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Button variant="primary" block>
                Book now
              </Button>
              <Badge tone="brand" className="w-fit">
                Most popular
              </Badge>
            </Card>
          </BusinessThemeProvider>
        ))}
      </div>
      <Separator className="my-8" />
      <p className="text-sm text-muted-foreground">
        End of kitchen sink. Shells:{" "}
        <Link className="text-brand underline-offset-4 hover:underline" href="/">
          marketing
        </Link>
        ,{" "}
        <Link className="text-brand underline-offset-4 hover:underline" href="/dev/ui/dashboard">
          dashboard
        </Link>
        ,{" "}
        <Link className="text-brand underline-offset-4 hover:underline" href="/dev/ui/public">
          public booking
        </Link>
        ,{" "}
        <Link className="text-brand underline-offset-4 hover:underline" href="/sign-in">
          sign-in
        </Link>
        .
      </p>
    </Section>
  );
}
