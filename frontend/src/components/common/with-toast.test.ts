import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { toast } from "@/components/ui/toast";
import { withToast } from "./with-toast";

vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("withToast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toasts the success message and resolves true", async () => {
    await expect(withToast(() => Promise.resolve(1), "Saved")).resolves.toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Saved");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("can word the success from the result", async () => {
    await withToast(
      () => Promise.resolve({ sentTo: "a@b.ie" }),
      (r) => `Sent to ${r.sentTo}`,
    );
    expect(toast.success).toHaveBeenCalledWith("Sent to a@b.ie");
  });

  it("toasts the error's message, resolves false and never throws", async () => {
    await expect(withToast(() => Promise.reject(new Error("Nope")), "Saved")).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Nope");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("uses the API's message for API errors", async () => {
    const err = new ApiError(409, "CONFLICT", "Already booked");
    await withToast(() => Promise.reject(err), "Saved");
    expect(toast.error).toHaveBeenCalledWith("Already booked");
  });
});
