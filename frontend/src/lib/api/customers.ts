import { api } from "./client";
import { businessPath, seg } from "./paths";
import type {
  Customer,
  CustomerDetail,
  CustomerExport,
  CustomerInput,
  CustomerListQuery,
  Page,
} from "./types";

const customerPath = (businessId: string, customerId: string, suffix = "") =>
  businessPath(businessId, `/customers/${seg(customerId)}${suffix}`);

/** Customers (§6.7). */
export const customersApi = {
  list: (businessId: string, query: CustomerListQuery = {}): Promise<Page<Customer>> =>
    api.get<Page<Customer>>(businessPath(businessId, "/customers"), query),

  get: (businessId: string, customerId: string): Promise<CustomerDetail> =>
    api.get<CustomerDetail>(customerPath(businessId, customerId)),

  create: (businessId: string, body: CustomerInput): Promise<Customer> =>
    api.post<Customer>(businessPath(businessId, "/customers"), body),

  update: (businessId: string, customerId: string, body: CustomerInput): Promise<Customer> =>
    api.patch<Customer>(customerPath(businessId, customerId), body),

  /** Admin only. GDPR erase: anonymises name/email/phone/answers. */
  erase: (businessId: string, customerId: string): Promise<void> =>
    api.delete(customerPath(businessId, customerId)),

  /** Admin only. JSON export of everything held about the customer. */
  export: (businessId: string, customerId: string): Promise<CustomerExport> =>
    api.get<CustomerExport>(customerPath(businessId, customerId, "/export")),
};
