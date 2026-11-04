"use client";

import { useEffect } from "react";
import {
  useForm,
  useWatch,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SectionContentMap, SiteSectionOf, SiteSectionType } from "@/lib/api/types";
import { sectionDef } from "@/lib/site/sections";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "../use-site-editor";

/**
 * A react-hook-form bound to one section's content: validated with the section's schema (the
 * mirror of the server's), and every change flows into the editor plan so the preview is live.
 */
export function useContentForm<T extends SiteSectionType>(section: SiteSectionOf<T>) {
  const { dispatch } = useEditor();
  type C = SectionContentMap[T] & FieldValues;
  const form = useForm<C>({
    defaultValues: section.content as DefaultValues<C>,
    resolver: zodResolver(sectionDef(section.type).schema as never) as unknown as Resolver<C>,
    mode: "onChange",
  });
  const id = section.id;
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) =>
        dispatch({ type: "updateContent", id, content: values as SectionContentMap[T] }),
    });
  }, [form, dispatch, id]);
  // Show existing problems (e.g. from an older plan) without waiting for an edit.
  useEffect(() => {
    void form.trigger();
  }, [form]);
  return form as UseFormReturn<C>;
}

/** Text input with a live character count against the section limit. */
export function TextField<T extends FieldValues>({
  name,
  label,
  max,
  optional,
  multiline,
  rows,
  placeholder,
  help,
}: {
  name: FieldPath<T>;
  label: string;
  max: number;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  help?: string;
}) {
  const value = useWatch<T>({ name }) as string | null | undefined;
  const length = value?.length ?? 0;
  const counter = (
    <span className={length > max ? "text-danger" : undefined}>
      {length}/{max}
    </span>
  );
  return (
    <FormField<T, FieldPath<T>>
      name={name}
      label={label}
      optional={optional}
      help={
        help ? (
          <span className="flex justify-between gap-3">
            <span>{help}</span>
            {counter}
          </span>
        ) : (
          counter
        )
      }
    >
      {(field) =>
        multiline ? (
          <Textarea {...field} value={field.value ?? ""} rows={rows ?? 3} placeholder={placeholder} />
        ) : (
          <Input {...field} value={field.value ?? ""} placeholder={placeholder} autoComplete="off" />
        )
      }
    </FormField>
  );
}

export function ToggleField<T extends FieldValues>({
  name,
  label,
  help,
}: {
  name: FieldPath<T>;
  label: string;
  help?: string;
}) {
  return (
    <FormField<T, FieldPath<T>> name={name} label={label} help={help} orientation="horizontal">
      {(field) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />}
    </FormField>
  );
}
