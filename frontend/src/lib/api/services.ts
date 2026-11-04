import { api } from "./client";
import { businessPath, seg } from "./paths";
import type { Service, ServiceInput } from "./types";

/** Services (§6.6). */
export const servicesApi = {
  /** Includes options, addons and requirements. */
  list: (businessId: string): Promise<Service[]> => api.get<Service[]>(businessPath(businessId, "/services")),

  create: (businessId: string, body: ServiceInput): Promise<Service> =>
    api.post<Service>(businessPath(businessId, "/services"), body),

  /** Full replace, including options/addons/requirements. */
  replace: (businessId: string, serviceId: string, body: ServiceInput): Promise<Service> =>
    api.put<Service>(businessPath(businessId, `/services/${seg(serviceId)}`), body),

  /** Deactivates instead of deleting when the service has bookings. */
  remove: (businessId: string, serviceId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/services/${seg(serviceId)}`)),
};
