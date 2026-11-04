/** API types: Customer groups and questions. Import them from `@/lib/api/types`. */
import type { FormQuestionKind } from "./common";

export type CustomerGroup = {
  id: string;
  name: string;
  description: string | null;
  /** Restricted groups are not self-selectable on the public page. */
  restricted: boolean;
  sortOrder: number;
  isActive: boolean;
};
export type CustomerGroupInput = Omit<CustomerGroup, "id">;

export type FormQuestion = {
  id: string;
  /** null = asked for every service. */
  serviceId: string | null;
  label: string;
  helpText: string | null;
  kind: FormQuestionKind;
  /** Choices for `select`. */
  options: string[];
  required: boolean;
  /** Sensitive answers are never emailed or sent to AI. */
  sensitive: boolean;
  sortOrder: number;
  isActive: boolean;
};
export type FormQuestionInput = Omit<FormQuestion, "id">;
