/** Types for the `toHaveNoViolations` matcher registered in `vitest.setup.ts` (vitest-axe only augments the old `Vi` namespace). */
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  interface Assertion {
    toHaveNoViolations: AxeMatchers["toHaveNoViolations"];
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations: AxeMatchers["toHaveNoViolations"];
  }
}
