import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoInput } from "../controls";
import { DemoPointerProvider } from "../demo-context";

function renderInput(input: React.ReactNode, focus: string | null = null) {
  return render(
    <DemoPointerProvider value={{ hover: null, pressed: null, focus }}>{input}</DemoPointerProvider>,
  );
}

describe("DemoInput", () => {
  it("is a script target that shows its placeholder until something is typed", () => {
    const { container, rerender } = renderInput(<DemoInput id="name" value="" placeholder="Alex Morgan" />);
    expect(container.querySelector('[data-demo="name"]')).not.toBeNull();
    expect(screen.getByText("Alex Morgan")).toHaveClass("text-subtle-foreground");

    rerender(
      <DemoPointerProvider value={{ hover: null, pressed: null, focus: null }}>
        <DemoInput id="name" value="Jordan" placeholder="Alex Morgan" />
      </DemoPointerProvider>,
    );
    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
  });

  it("shows the caret and the focus ring while the cursor is in it", () => {
    const { container } = renderInput(<DemoInput id="price" value="40" leading="€" size="lg" />, "price");
    const field = container.querySelector<HTMLElement>('[data-demo="price"]');
    expect(field).toHaveClass("ring-3", "h-11");
    expect(field?.querySelector('[aria-hidden="true"]')).not.toBeNull(); // the caret
    expect(field).toHaveTextContent("€40");
  });
});
