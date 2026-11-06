import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicBookingShell, type PublicShellBusiness } from "./public-booking-shell";

const business: PublicShellBusiness = {
  name: "Harbour Lane Studio",
  slug: "harbour-lane",
  branding: { primaryColor: "#0369a1", logoUrl: null, coverImageUrl: null },
};

function Page({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  return <p>Page</p>;
}

describe("PublicBookingShell", () => {
  it("keeps the page mounted while the business and then its site's theme arrive", () => {
    const onMount = vi.fn();
    const shell = (b: PublicShellBusiness | null) => (
      <PublicBookingShell business={b}>
        <Page onMount={onMount} />
      </PublicBookingShell>
    );
    const view = render(shell(null));
    const scope = () => {
      const el = screen.getByText("Page").closest(".min-h-dvh");
      if (!el) throw new Error("no theme scope");
      return el;
    };
    expect(scope()).not.toHaveAttribute("data-theme");

    view.rerender(shell(business));
    view.rerender(
      shell({
        ...business,
        site: { plan: { theme: "editorial", palette: { primaryColor: "#0369a1", accent: null } } },
      }),
    );
    expect(scope()).toHaveAttribute("data-theme", "editorial");
    expect(scope()).not.toHaveAttribute("data-business-theme");
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it("wears the branding's portal style without a site, the site's theme with one, and no link home without a site", () => {
    const styled = { ...business, branding: { ...business.branding, portalStyle: "bold" as const } };
    const view = render(
      <PublicBookingShell business={styled}>
        <p>Page</p>
      </PublicBookingShell>,
    );
    const scope = () => screen.getByText("Page").closest("[data-theme]");
    expect(scope()).toHaveAttribute("data-theme", "bold");
    expect(screen.queryByRole("link", { name: /Harbour Lane Studio/ })).not.toBeInTheDocument();
    view.rerender(
      <PublicBookingShell
        business={{
          ...styled,
          site: { plan: { theme: "calm", palette: { primaryColor: "#0369a1", accent: null } } },
        }}
      >
        <p>Page</p>
      </PublicBookingShell>,
    );
    expect(scope()).toHaveAttribute("data-theme", "calm");
  });
});
