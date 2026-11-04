"use client";

import type { ControllerRenderProps } from "react-hook-form";
import type { FormQuestionKind } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AnswerField = Omit<ControllerRenderProps, "value"> & { value: string | undefined };

/**
 * Renders the control for answering a booking question of any kind but a checkbox (whose label sits beside the box, so its
 * form decides the layout): the public booking form and the staff "New booking" sheet both use it. `field` is the
 * react-hook-form field for `answers.<questionId>`; answers are strings. A render function for a FormField's
 * children (it renders the field's own ref), not a component.
 */
export function questionAnswerInput(
  q: { kind: Exclude<FormQuestionKind, "checkbox">; options: readonly string[] },
  field: AnswerField,
  size: "md" | "lg" = "md",
) {
  const value = field.value ?? "";
  switch (q.kind) {
    case "textarea":
      return <Textarea {...field} value={value} rows={size === "lg" ? 3 : 2} />;
    case "select":
      return (
        <Select value={value || undefined} onValueChange={field.onChange}>
          <SelectTrigger
            ref={field.ref}
            size={size}
            onBlur={field.onBlur}
            className={cn(!value && "text-subtle-foreground")}
          >
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {q.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "number":
      return <Input {...field} value={value} size={size} inputMode="decimal" className="max-w-40" />;
    case "email":
      return <Input {...field} value={value} size={size} type="email" inputMode="email" />;
    case "phone":
      return <Input {...field} value={value} size={size} type="tel" inputMode="tel" />;
    default:
      return <Input {...field} value={value} size={size} />;
  }
}
