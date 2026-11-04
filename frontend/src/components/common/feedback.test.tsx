import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { expectNoAxeViolations } from "@/test/axe";
import { ErrorState } from "./feedback";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/gleam/bookings" }));

afterEach(() => vi.unstubAllEnvs());

const unreachable = new ApiError(0, "NETWORK_ERROR", "Failed to fetch");

describe("ErrorState", () => {
  it("shows the API's message with a retry", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState error={new ApiError(500, "INTERNAL_SERVER_ERROR", "Something broke")} onRetry={onRetry} />,
    );
    expect(screen.getByRole("heading", { name: "This didn’t load" })).toBeInTheDocument();
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("mentions the backend only in development when the server can't be reached", () => {
    vi.stubEnv("NODE_ENV", "development");
    const { unmount } = render(<ErrorState error={unreachable} />);
    expect(screen.getByRole("heading", { name: "Can't reach bookanything" })).toBeInTheDocument();
    expect(screen.getByText(/make sure the backend is running/)).toBeInTheDocument();
    unmount();

    vi.stubEnv("NODE_ENV", "production");
    render(<ErrorState error={unreachable} />);
    expect(
      screen.getByText("The server didn't respond. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/backend/)).not.toBeInTheDocument();
  });

  it("offers to sign in again, back to this page, when the session has ended", async () => {
    const { container } = render(
      <ErrorState error={new ApiError(401, "UNAUTHENTICATED", "Sign in required.")} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "You're signed out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Fdashboard%2Fgleam%2Fbookings",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
