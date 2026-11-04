import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAVE_WITH_UNSAVED_CHANGES, useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

/** Stands in for Next's <Link>: a React click handler that navigates in-app. */
const navigate = vi.fn();

function Page({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty);
  const link = (href: string, label: string, extra: React.AnchorHTMLAttributes<HTMLAnchorElement> = {}) => (
    <a
      href={href}
      {...extra}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      {label}
    </a>
  );
  return (
    <>
      {link("/dashboard/lumen-physio/services", "Services")}
      {link("/?tab=ai", "Same page")}
      {link("/lumen-physio", "View site", { target: "_blank" })}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
});

const confirm = (answer: boolean) => vi.spyOn(window, "confirm").mockReturnValue(answer);
const beforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe("useUnsavedChangesGuard", () => {
  it("does nothing while there are no unsaved changes", () => {
    const ask = confirm(false);
    render(<Page dirty={false} />);
    fireEvent.click(screen.getByRole("link", { name: "Services" }));
    expect(ask).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/dashboard/lumen-physio/services");
    expect(beforeUnload().defaultPrevented).toBe(false);
  });

  it("asks before following an in-app link, and stays when told to", () => {
    const ask = confirm(false);
    render(<Page dirty />);
    fireEvent.click(screen.getByRole("link", { name: "Services" }));
    expect(ask).toHaveBeenCalledWith(LEAVE_WITH_UNSAVED_CHANGES);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("follows the link when the owner agrees to leave", () => {
    confirm(true);
    render(<Page dirty />);
    fireEvent.click(screen.getByRole("link", { name: "Services" }));
    expect(navigate).toHaveBeenCalledWith("/dashboard/lumen-physio/services");
  });

  it("lets links that don't leave the page through without asking", () => {
    const ask = confirm(false);
    render(<Page dirty />);
    fireEvent.click(screen.getByRole("link", { name: "Same page" }));
    fireEvent.click(screen.getByRole("link", { name: "View site" }));
    fireEvent.click(screen.getByRole("link", { name: "Services" }), { metaKey: true });
    expect(ask).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(3);
  });

  it("has the browser ask before the tab is closed or reloaded, until the changes are saved", () => {
    const { rerender } = render(<Page dirty />);
    expect(beforeUnload().defaultPrevented).toBe(true);
    rerender(<Page dirty={false} />);
    expect(beforeUnload().defaultPrevented).toBe(false);
  });
});
