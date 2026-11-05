import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function Example() {
  return (
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">One</TabsTrigger>
        <TabsTrigger value="b">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="a">First</TabsContent>
      <TabsContent value="b">Second</TabsContent>
    </Tabs>
  );
}

describe("TabsTrigger", () => {
  it("marks a tab reached by pointer, so its focus ring stays off, and clears that on blur", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const two = screen.getByRole("tab", { name: "Two" });
    await user.click(two);
    expect(two).toHaveAttribute("data-pointer");
    await user.keyboard("{ArrowLeft}");
    expect(two).not.toHaveAttribute("data-pointer");
  });

  it("leaves a tab reached by keyboard unmarked, so its ring shows", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Two" })).not.toHaveAttribute("data-pointer");
  });
});
