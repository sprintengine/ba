/**
 * Test-only: the value, or a failing assertion naming [what]. For indexed access in tests under
 * noUncheckedIndexedAccess (`must(rows[0], "first row")`), where a missing element is a test failure, not a case to
 * handle. Production code narrows with real guards instead.
 */
export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === undefined || value === null) throw new Error(`Expected ${what} to be present`);
  return value;
}
