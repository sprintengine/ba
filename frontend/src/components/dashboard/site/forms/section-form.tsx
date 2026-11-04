"use client";

import { FormProvider, type FieldValues, type UseFormReturn } from "react-hook-form";

/** Layout + form context for a section's fields (changes apply live; nothing is submitted). */
export function SectionForm<T extends FieldValues>({
  form,
  children,
}: {
  form: UseFormReturn<T>;
  children: React.ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-5">{children}</div>
    </FormProvider>
  );
}
