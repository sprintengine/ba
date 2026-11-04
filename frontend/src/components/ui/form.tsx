"use client";

/**
 * react-hook-form + zod integration.
 *
 *   const schema = z.object({ name: z.string().min(1, "Enter a name") });
 *   const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: "" } });
 *   const save = useUpdateBusiness(businessId);
 *
 *   <Form form={form} onSubmit={(values) => save.mutateAsync(values).catch((e) => applyApiErrors(form, e))}>
 *     <FormField name="name" label="Business name">
 *       {(field) => <Input {...field} />}
 *     </FormField>
 *     <FormRootError />
 *     <FormSubmit>Save</FormSubmit>
 *   </Form>
 */
import {
  FormProvider,
  useController,
  useFormContext,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form";
import { CircleAlert } from "lucide-react";
import { isApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";
import { Field, type FieldProps } from "./field";

type FormProps<T extends FieldValues> = Omit<React.ComponentProps<"form">, "onSubmit"> & {
  form: UseFormReturn<T>;
  onSubmit: SubmitHandler<T>;
};

export function Form<T extends FieldValues>({ form, onSubmit, className, children, ...props }: FormProps<T>) {
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex flex-col gap-5", className)}
        {...props}
      >
        {children}
      </form>
    </FormProvider>
  );
}

type FormFieldProps<T extends FieldValues, N extends FieldPath<T>> = Omit<
  FieldProps,
  "children" | "error"
> & {
  name: N;
  children: (field: ControllerRenderProps<T, N>, state: ControllerFieldState) => React.ReactNode;
};

/** A <Field> bound to a react-hook-form field: label, help, and validation error handled for you. */
export function FormField<T extends FieldValues, N extends FieldPath<T>>({
  name,
  children,
  ...fieldProps
}: FormFieldProps<T, N>) {
  const { control } = useFormContext<T>();
  const { field, fieldState } = useController({ name, control });
  return (
    <Field {...fieldProps} error={fieldState.error?.message}>
      {children(field, fieldState)}
    </Field>
  );
}

/** Shows `errors.root` (set by applyApiErrors for non-field API errors). */
export function FormRootError({ className }: { className?: string }) {
  const {
    formState: { errors },
  } = useFormContext();
  const message = errors.root?.message;
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex animate-fade-in items-start gap-2 rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger-soft-foreground",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/** Submit button that shows a spinner while the form is submitting. */
export function FormSubmit({ variant = "primary", children, ...props }: ButtonProps) {
  const {
    formState: { isSubmitting },
  } = useFormContext();
  return (
    <Button type="submit" variant={variant} loading={isSubmitting} {...props}>
      {children}
    </Button>
  );
}

/**
 * Map an API error onto the form: `ApiError.fields` → per-field errors
 * (unknown fields and the message go to `root`). Use in mutation catch blocks.
 * The backend names list items with an index (`options[0].name`); they map to the form's `options.0.name`.
 * Returns true when it handled an ApiError.
 */
export function applyApiErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown): boolean {
  if (!isApiError(error)) {
    form.setError("root", { message: "Something went wrong. Please try again." });
    return false;
  }
  const known = new Set(Object.keys(form.getValues()));
  let setAny = false;
  for (const [apiField, message] of Object.entries(error.fields)) {
    const field = apiField.replace(/\[(\d+)\]/g, ".$1");
    const [top = field] = field.split(".");
    if (known.has(top)) {
      form.setError(field as FieldPath<T>, { message }, { shouldFocus: !setAny });
      setAny = true;
    }
  }
  if (!setAny || Object.keys(error.fields).length === 0) {
    form.setError("root", { message: error.message });
  }
  return true;
}
