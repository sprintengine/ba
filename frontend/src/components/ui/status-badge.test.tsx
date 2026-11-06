import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingExceptions, BookingPaymentBadge } from "./status-badge";

const deposit = {
  paymentStatus: "paid",
  depositCents: 1000,
  priceCents: 4000,
  amountPaidCents: 1000,
} as const;

describe("a booking's payment", () => {
  it("says the deposit is paid while the rest is due, never Paid", () => {
    render(<BookingPaymentBadge booking={deposit} />);
    expect(screen.getByText("Deposit paid")).toBeInTheDocument();
    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
  });

  it("says Paid once it's paid in full", () => {
    render(<BookingPaymentBadge booking={{ ...deposit, amountPaidCents: 4000 }} />);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("says nothing on a free booking", () => {
    const { container } = render(
      <BookingPaymentBadge booking={{ ...deposit, paymentStatus: "not_required", depositCents: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("flags a deposit in a list, where a paid booking is quiet", () => {
    render(<BookingExceptions status="confirmed" payment="paid" booking={deposit} />);
    expect(screen.getByText("Deposit paid")).toBeInTheDocument();
  });
});
