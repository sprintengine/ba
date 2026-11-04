/** Path helpers shared by the endpoint modules. Every dynamic segment is URI-encoded. */

/** Encode a single path segment. */
export const seg = (value: string) => encodeURIComponent(value);

/** `/v1/businesses/{businessId}{path}` */
export function businessPath(businessId: string, path = ""): string {
  return `/v1/businesses/${seg(businessId)}${path}`;
}
