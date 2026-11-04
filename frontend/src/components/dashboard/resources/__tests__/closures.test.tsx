import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayInTz } from "@/lib/format/datetime";
import { business, json, mockApi, renderDashboard } from "@/components/dashboard/test/render";
import { Closures } from "../time-off";

afterEach(() => vi.unstubAllGlobals());

const closuresPath = "/v1/businesses/b1/closures";

describe("closure dialog", () => {
  it("adds a whole-day closure for today with the note", async () => {
    const posted: unknown[] = [];
    mockApi((method, path, body) => {
      if (method === "POST" && path === closuresPath) {
        posted.push(body);
        return { id: "c1", resourceId: null, ...(body as object) };
      }
      if (path === closuresPath) return [];
      return {};
    });
    const user = userEvent.setup();
    renderDashboard(<Closures editable />);
    await user.click(await screen.findByRole("button", { name: /add closure/i }));
    const dialog = await screen.findByRole("dialog", { name: "Close the business" });
    await user.type(within(dialog).getByRole("textbox", { name: /note/i }), " Bank holiday ");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(posted).toEqual([
        {
          date: todayInTz(business.timezone),
          isAvailable: false,
          startTime: null,
          endTime: null,
          reason: "Bank holiday",
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the server's field error under the field and keeps the dialog open", async () => {
    mockApi((method, path) => {
      if (method === "POST" && path === closuresPath)
        return json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "Please check the highlighted fields.",
              fields: { reason: "Must be at most 200 characters" },
            },
          },
          400,
        );
      if (path === closuresPath) return [];
      return {};
    });
    const user = userEvent.setup();
    renderDashboard(<Closures editable />);
    await user.click(await screen.findByRole("button", { name: /add closure/i }));
    const dialog = await screen.findByRole("dialog", { name: "Close the business" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Must be at most 200 characters")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: /note/i })).toHaveAttribute("aria-invalid", "true");
  });
});
