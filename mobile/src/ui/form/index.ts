/**
 * Forms (README.md "Forms"): react-hook-form + the website's zod schemas (`@shared/settings/*-form`,
 * `@shared/services/service-form`…), the design system's fields bound to them, API field errors, unsaved-changes
 * guards, save feedback. Import from "~/ui/form".
 */
export { applyApiErrors } from "./api-errors";
export {
  FormCheckbox,
  FormChipGroup,
  FormColorField,
  FormDateField,
  FormMoneyField,
  FormNumberField,
  FormRadioGroup,
  FormRootError,
  FormSearchSelect,
  FormSelect,
  FormSwitch,
  FormTextField,
  FormTimeField,
} from "./fields";
export {
  FormScroll,
  HeaderButton,
  SaveBar,
  type FormScrollProps,
  type HeaderButtonProps,
  type SaveBarProps,
} from "./FormScroll";
export {
  confirmAction,
  hapticError,
  hapticSelection,
  hapticSuccess,
  useSaveFeedback,
  type ConfirmOptions,
} from "./feedback";
export { confirmDiscard, UnsavedChangesScope, useConfirmLeave, useUnsavedChangesGuard } from "./unsaved";
