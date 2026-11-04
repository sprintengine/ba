import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import { ListingCard } from "../listing-card";
import { listing } from "./fixtures";

// Thu 1 Oct 2026, 10:00 in Dublin.
const now = new Date("2026-10-01T09:00:00Z");

describe("ListingCard", () => {
  it("links the whole card to the business site by name", () => {
    render(<ListingCard listing={listing()} now={now} />);
    const link = screen.getByRole("link", { name: "Lumen Physiotherapy" });
    expect(link).toHaveAttribute("href", "/lumen-physio");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows category, city, distance and the from price", () => {
    render(<ListingCard listing={listing()} now={now} />);
    expect(screen.getByText("Physiotherapy")).toBeInTheDocument();
    expect(screen.getByText("Dublin · 1.2 km")).toBeInTheDocument();
    expect(screen.getByText("from €45")).toBeInTheDocument();
  });

  it("shows deals with their label and summary", () => {
    render(<ListingCard listing={listing()} now={now} />);
    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("20% off")).toBeInTheDocument();
    expect(screen.getByText(/Fri, 13:00–17:00/)).toBeInTheDocument();
  });

  it("lists next free times in the business timezone, with the discounted price and the original struck through", () => {
    render(<ListingCard listing={listing()} now={now} />);
    const chips = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(chips).toHaveLength(2);
    const [today, tomorrow] = [must(chips[0], "first chip"), must(chips[1], "second chip")];
    expect(today).toHaveTextContent("Today 14:00");
    expect(tomorrow).toHaveTextContent("Tomorrow 13:30");
    expect(within(tomorrow).getByText("€36")).toBeInTheDocument();
    expect(tomorrow.querySelector("s")).toHaveTextContent("€45");
    expect(tomorrow).toHaveTextContent(/was €45, now €36/);
    expect(today.querySelector("s")).toBeNull();
  });

  it("never shows a rating and copes with missing data", () => {
    render(
      <ListingCard
        listing={listing({ distanceKm: null, priceFromCents: null, deals: [], nextSlots: [], rating: null })}
        now={now}
      />,
    );
    expect(screen.queryByText(/rating|stars|reviews/i)).toBeNull();
    expect(screen.queryByText("Deals")).toBeNull();
    expect(screen.queryByText(/from €/)).toBeNull();
    expect(screen.getByText("Dublin")).toBeInTheDocument();
    expect(screen.getByText("No free times in the next few days")).toBeInTheDocument();
  });

  it("shows free businesses as Free", () => {
    render(<ListingCard listing={listing({ priceFromCents: 0 })} now={now} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
  });
});
