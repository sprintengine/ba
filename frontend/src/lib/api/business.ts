import { api, type RequestOptions } from "./client";
import { businessPath, seg } from "./paths";
import type {
  Business,
  CustomerGroup,
  CustomerGroupInput,
  FormQuestion,
  FormQuestionInput,
  Overview,
  UpdateBusiness,
} from "./types";

/** Business settings, customer groups and questions (§6.4). */
export const businessApi = {
  get: (businessId: string): Promise<Business> => api.get<Business>(businessPath(businessId)),

  /** The same read by the business's slug (members only, like by id; 404 for an unknown slug). */
  getBySlug: (slug: string, options?: Pick<RequestOptions, "signal">): Promise<Business> =>
    api.get<Business>(businessPath(slug), undefined, options),

  update: (businessId: string, body: UpdateBusiness): Promise<Business> =>
    api.patch<Business>(businessPath(businessId), body),

  /** Owner only. Soft delete (status → suspended). */
  remove: (businessId: string): Promise<void> => api.delete(businessPath(businessId)),

  overview: (businessId: string): Promise<Overview> =>
    api.get<Overview>(businessPath(businessId, "/overview")),

  customerGroups: (businessId: string): Promise<CustomerGroup[]> =>
    api.get<CustomerGroup[]>(businessPath(businessId, "/customer-groups")),

  createCustomerGroup: (businessId: string, body: CustomerGroupInput): Promise<CustomerGroup> =>
    api.post<CustomerGroup>(businessPath(businessId, "/customer-groups"), body),

  updateCustomerGroup: (
    businessId: string,
    groupId: string,
    body: Partial<CustomerGroupInput>,
  ): Promise<CustomerGroup> =>
    api.patch<CustomerGroup>(businessPath(businessId, `/customer-groups/${seg(groupId)}`), body),

  deleteCustomerGroup: (businessId: string, groupId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/customer-groups/${seg(groupId)}`)),

  questions: (businessId: string): Promise<FormQuestion[]> =>
    api.get<FormQuestion[]>(businessPath(businessId, "/questions")),

  createQuestion: (businessId: string, body: FormQuestionInput): Promise<FormQuestion> =>
    api.post<FormQuestion>(businessPath(businessId, "/questions"), body),

  updateQuestion: (
    businessId: string,
    questionId: string,
    body: Partial<FormQuestionInput>,
  ): Promise<FormQuestion> =>
    api.patch<FormQuestion>(businessPath(businessId, `/questions/${seg(questionId)}`), body),

  deleteQuestion: (businessId: string, questionId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/questions/${seg(questionId)}`)),
};
