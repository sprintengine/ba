/** Focus return for dialogs opened from code: Radix only returns focus to a <DialogTrigger>. */
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";

function EditList() {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      {["Members", "Students"].map((name) => (
        <Button key={name} onClick={() => setEditing(name)}>
          Edit {name}
        </Button>
      ))}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogTitle>Edit {editing}</DialogTitle>
          <DialogDescription>Change the group.</DialogDescription>
          <Button onClick={() => setEditing(null)}>Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A dialog that only exists while open, as the settings pages render their edit dialogs. */
function MountedWhileOpen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New group</Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>Add a group.</DialogDescription>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

describe("Dialog focus return", () => {
  it("a controlled dialog gives focus back to the button that opened it", async () => {
    const user = userEvent.setup();
    render(<EditList />);
    await user.click(screen.getByRole("button", { name: "Edit Students" }));
    expect(await screen.findByRole("dialog", { name: "Edit Students" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Students" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Edit Members" }));
    await screen.findByRole("dialog", { name: "Edit Members" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Members" })).toHaveFocus());
  });

  it("so does one that is mounted already open", async () => {
    const user = userEvent.setup();
    render(<MountedWhileOpen />);
    await user.click(screen.getByRole("button", { name: "New group" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "New group" })).toHaveFocus());
  });

  it("an uncontrolled dialog still returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
          <DialogDescription>A dialog.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toHaveFocus());
  });
});
