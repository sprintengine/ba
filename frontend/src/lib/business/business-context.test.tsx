import { memo, useState } from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Business, Me, MemberRole } from "@/lib/api/types";
import { BusinessContextProvider, useBusinessContext, usePermissions } from "./business-context";

const business = { id: "b1", name: "Lumen" } as unknown as Business;
const me = { memberships: [] } as unknown as Me;

describe("BusinessContextProvider", () => {
  it("keeps the context value while its parts are unchanged, even from a fresh object literal", () => {
    let consumerRenders = 0;
    const seen: unknown[] = [];
    const Consumer = memo(function Consumer() {
      consumerRenders += 1;
      seen.push(useBusinessContext());
      return null;
    });
    let bump = () => {};
    let setRole = (_role: MemberRole) => {};
    function Parent() {
      const [, setTick] = useState(0);
      const [role, setRoleState] = useState<MemberRole>("owner");
      bump = () => setTick((t) => t + 1);
      setRole = setRoleState;
      return (
        <BusinessContextProvider value={{ business, role, me }}>
          <Consumer />
          <p>{role}</p>
        </BusinessContextProvider>
      );
    }
    render(<Parent />);
    expect(consumerRenders).toBe(1);
    act(() => bump());
    act(() => bump());
    expect(consumerRenders).toBe(1);
    act(() => setRole("staff"));
    expect(screen.getByText("staff")).toBeInTheDocument();
    expect(consumerRenders).toBe(2);
    expect(seen[1]).toEqual({ business, role: "staff", me });
  });
});

describe("usePermissions", () => {
  it("returns the same object until the role changes", () => {
    let role: MemberRole = "admin";
    const { result, rerender } = renderHook(() => usePermissions(), {
      wrapper: ({ children }) => (
        <BusinessContextProvider value={{ business, role, me }}>{children}</BusinessContextProvider>
      ),
    });
    const first = result.current;
    expect(first.can("admin")).toBe(true);
    expect(first.can("owner")).toBe(false);
    rerender();
    expect(result.current).toBe(first);
    role = "owner";
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.can("owner")).toBe(true);
  });
});
