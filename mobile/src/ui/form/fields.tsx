/**
 * react-hook-form bindings for the design system's fields, so a screen writes
 * `<FormTextField control={form.control} name="name" label="Business name" />` and gets the value, the change
 * handler, the error (zod's or the API's, via `applyApiErrors`) and focus-on-error wired up. The website's
 * `FormField` (components/ui/form.tsx) does the same for its inputs.
 */
import {
  useController,
  useFormState,
  type Control,
  type FieldPath,
  type FieldValues,
  type PathValue,
} from "react-hook-form";
import { Banner } from "../Banner";
import { Checkbox, type CheckboxProps } from "../Checkbox";
import { ChipGroup, type ChipGroupProps } from "../ChipGroup";
import { ColorField, type ColorFieldProps } from "../ColorField";
import { DateField, TimeField, type DateFieldProps, type TimeFieldProps } from "../DateTimeField";
import { MoneyField, NumberField, type MoneyFieldProps, type NumberFieldProps } from "../NumberField";
import { RadioGroup, type RadioGroupProps } from "../RadioGroup";
import { SearchSelect, type SearchSelectProps } from "../SearchSelect";
import { Select, type SelectProps } from "../Select";
import { Switch, type SwitchProps } from "../Switch";
import { TextField, type TextFieldProps } from "../TextField";

type Bound<T extends FieldValues, N extends FieldPath<T>> = { control: Control<T>; name: N };

/** react-hook-form types values by path; each binding knows its field's runtime type. */
const as = <V,>(value: unknown) => value as V;

export function FormTextField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  transform,
  ...props
}: Bound<T, N> &
  Omit<TextFieldProps, "value" | "onChangeText" | "error"> & {
    /** Rewrites what's typed before it's stored (the slug field lowercases). */
    transform?: (text: string) => string;
  }) {
  const {
    field: { ref, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name });
  return (
    <TextField
      ref={ref}
      {...props}
      value={as<string | null>(value) ?? ""}
      onChangeText={(text) => onChange(transform ? transform(text) : text)}
      onBlur={(e) => {
        onBlur();
        props.onBlur?.(e);
      }}
      error={fieldState.error?.message}
    />
  );
}

export function FormNumberField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<NumberFieldProps, "value" | "onChange" | "error">) {
  const {
    field: { ref, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name });
  return (
    <NumberField
      ref={ref}
      {...props}
      value={as<number | null>(value)}
      onChange={(value) => onChange(value)}
      onBlur={() => onBlur()}
      error={fieldState.error?.message}
    />
  );
}

export function FormMoneyField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<MoneyFieldProps, "value" | "onChange" | "error">) {
  const {
    field: { ref, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name });
  return (
    <MoneyField
      ref={ref}
      {...props}
      value={as<number | null>(value)}
      onChange={(value) => onChange(value)}
      onBlur={() => onBlur()}
      error={fieldState.error?.message}
    />
  );
}

export function FormSwitch<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<SwitchProps, "value" | "onValueChange">) {
  const {
    field: { value, onChange },
  } = useController({ control, name });
  return <Switch {...props} value={!!value} onValueChange={(v) => onChange(v)} />;
}

export function FormCheckbox<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<CheckboxProps, "checked" | "onChange">) {
  const {
    field: { value, onChange },
  } = useController({ control, name });
  return <Checkbox {...props} checked={!!value} onChange={(v) => onChange(v)} />;
}

export function FormSelect<T extends FieldValues, N extends FieldPath<T>, V extends string>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<SelectProps<V>, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  return (
    <Select<V>
      {...props}
      value={as<V | null>(value)}
      onChange={(v) => onChange(v as PathValue<T, N>)}
      error={fieldState.error?.message}
    />
  );
}

export function FormRadioGroup<T extends FieldValues, N extends FieldPath<T>, V extends string>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<RadioGroupProps<V>, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  return (
    <RadioGroup<V>
      {...props}
      value={as<V | null>(value)}
      onChange={(v) => onChange(v as PathValue<T, N>)}
      error={fieldState.error?.message}
    />
  );
}

export function FormChipGroup<T extends FieldValues, N extends FieldPath<T>, V extends string>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<ChipGroupProps<V>, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  return (
    <ChipGroup<V>
      {...props}
      value={as<V[]>(value) ?? []}
      onChange={(v) => onChange(v as PathValue<T, N>)}
      error={fieldState.error?.message ?? fieldState.error?.root?.message}
    />
  );
}

export function FormColorField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<ColorFieldProps, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  return (
    <ColorField
      {...props}
      value={as<string>(value)}
      onChange={(v) => onChange(v)}
      error={fieldState.error?.message}
    />
  );
}

export function FormDateField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<DateFieldProps, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  const date = as<string | null>(value);
  return (
    <DateField
      {...props}
      value={date === "" ? null : date}
      onChange={(v) => onChange(v)}
      error={fieldState.error?.message}
    />
  );
}

export function FormTimeField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<TimeFieldProps, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  return (
    <TimeField
      {...props}
      value={as<string>(value)}
      onChange={(v) => onChange(v)}
      error={fieldState.error?.message}
    />
  );
}

export function FormSearchSelect<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  ...props
}: Bound<T, N> & Omit<SearchSelectProps, "value" | "onChange" | "error">) {
  const {
    field: { value, onChange },
    fieldState,
  } = useController({ control, name });
  return (
    <SearchSelect
      {...props}
      value={as<string | null>(value)}
      onChange={(v) => onChange(v)}
      error={fieldState.error?.message}
    />
  );
}

/** The form-level error (`errors.root`, set by `applyApiErrors` for messages that belong to no field). */
export function FormRootError<T extends FieldValues>({ control }: { control: Control<T> }) {
  const { errors } = useFormState({ control });
  const message = errors.root?.message;
  if (!message) return null;
  return (
    <Banner tone="danger" testID="form-error">
      {message}
    </Banner>
  );
}
