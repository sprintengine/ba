/** Route params as the website's query string (`?service=…&date=…`), for the shared parsers. */
export function paramsToSearch(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) search.set(key, v);
  }
  return search;
}
