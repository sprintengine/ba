import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadBlob", () => {
  it("clicks a link in the document, removes it, and revokes the URL only after a moment", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let clicked: { inDocument: boolean; href: string; download: string } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { inDocument: document.body.contains(this), href: this.href, download: this.download };
    });
    const blob = new Blob(["{}"], { type: "application/json" });

    downloadBlob(blob, "export.json");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual({ inDocument: true, href: "blob:file", download: "export.json" });
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:file");
  });
});
