/** The review step's collapsible customer groups and booking questions sections, and jumping to their problems. */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_LIMITS, QUESTION_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { createButton, fixture, mockOnboardingApi, renderReview, rowToggle, paste } from "./render";

beforeEach(() => {
  window.scrollTo = vi.fn();
  mockOnboardingApi();
});
afterEach(() => vi.unstubAllGlobals());

const groupsToggle = () => screen.getByRole("button", { name: /customer groups/i });
const questionsToggle = () => screen.getByRole("button", { name: /booking questions/i });

describe("Customer groups", () => {
  it("is collapsed to a summary and opens from the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = renderReview();
    const toggle = groupsToggle();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Members");
    expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Members");
    await expectNoAxeViolations(container);

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("adds, validates, restricts and removes groups", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(groupsToggle());
    await user.click(screen.getByRole("button", { name: "Add group" }));

    const [members, added] = screen.getAllByRole("textbox", { name: "Group name" });
    expect(added).toHaveValue("New group");
    expect(added).toHaveAttribute("maxLength", String(GROUP_LIMITS.name));
    await user.clear(must(added, "new group"));
    expect(added).toHaveAccessibleDescription("Give this group a name");
    await paste(user, must(added, "new group"), "members");
    expect(added).toHaveAccessibleDescription("Another group has this name");
    await user.clear(must(added, "new group"));
    await paste(user, must(added, "new group"), "Students");
    expect(added).not.toHaveAttribute("aria-invalid");
    expect(members).toHaveValue("Members");

    const descriptions = screen.getAllByRole("textbox", { name: "Group description" });
    await paste(user, must(descriptions[1], "new description"), "Full-time students");

    const restricted = screen.getAllByRole("switch", { name: /only book times reserved/i });
    expect(restricted[0]).toBeChecked();
    await user.click(must(restricted[1], "Students restricted"));
    expect(restricted[1]).toBeChecked();

    // Both remove buttons (icon on large screens, text on small) are named for the group.
    expect(screen.getAllByRole("button", { name: "Remove Students" })).toHaveLength(2);
    await user.click(must(screen.getAllByRole("button", { name: "Remove Students" })[0], "Remove Students"));
    expect(screen.getAllByRole("textbox", { name: "Group name" })).toHaveLength(1);
    expect(groupsToggle()).toHaveTextContent("Members");
  });

  it("says groups are optional when there are none", () => {
    renderReview({ ...fixture(), customerGroups: [], services: [], resources: [] });
    expect(groupsToggle()).toHaveTextContent("Optional. Everyone books the same way.");
  });
});

describe("Booking questions", () => {
  it("edits a question: label, help, answer type, service and switches", async () => {
    const user = userEvent.setup();
    const { container } = renderReview();
    await user.click(questionsToggle());
    expect(questionsToggle()).toHaveTextContent("2 questions asked when booking.");

    await user.click(rowToggle(/^Vehicle registration/));
    const label = screen.getByRole("textbox", { name: /^Question/ });
    expect(label).toHaveAttribute("maxLength", String(QUESTION_LIMITS.label));
    await expectNoAxeViolations(container);

    await user.clear(label);
    expect(label).toHaveAccessibleDescription("Write the question");
    await paste(user, label, "Registration");
    await paste(user, screen.getByRole("textbox", { name: /help text/i }), "As on the windscreen");

    await user.click(screen.getByRole("combobox", { name: "Ask for" }));
    await user.click(await screen.findByRole("option", { name: "Full valet" }));
    expect(screen.getByRole("combobox", { name: "Ask for" })).toHaveTextContent("Full valet");

    await user.click(screen.getByRole("switch", { name: /^Sensitive/ }));
    await user.click(screen.getByRole("switch", { name: /^Required/ }));
    const row = screen.getByRole("button", { name: /^Registration/, expanded: true });
    expect(row).toHaveTextContent("Short answer · Optional · Only for Full valet");
    expect(row).toHaveTextContent("Sensitive");
  });

  it("turns a question into a dropdown with choices that must not be blank", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(questionsToggle());
    await user.click(rowToggle(/^Vehicle registration/));

    const kind = screen.getByRole("combobox", { name: "Answer type" });
    kind.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Dropdown" }));
    expect(screen.getByRole("textbox", { name: "Choice 1" })).toHaveValue("Option 1");
    expect(screen.getByRole("textbox", { name: "Choice 2" })).toHaveValue("Option 2");

    await user.click(screen.getByRole("button", { name: "Add choice" }));
    const third = screen.getByRole("textbox", { name: "Choice 3" });
    expect(third).toHaveAttribute("aria-invalid", "true");
    expect(third).toHaveAccessibleDescription("Choices can't be blank");
    expect(screen.getByRole("textbox", { name: "Choice 1" })).not.toHaveAttribute("aria-invalid");

    await paste(user, third, "Van");
    expect(third).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "Remove choice Option 1" }));
    expect(screen.getByRole("textbox", { name: "Choice 1" })).toHaveValue("Option 2");
  });

  it("adds a question opened for editing and removes it", async () => {
    const user = userEvent.setup();
    renderReview({ ...fixture(), questions: [] });
    expect(questionsToggle()).toHaveTextContent("Optional. Ask for anything you need before a booking.");
    await user.click(questionsToggle());
    await user.click(screen.getByRole("button", { name: "Add question" }));
    expect(screen.getByRole("button", { name: /^Untitled question/, expanded: true })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Question/ })).toHaveAccessibleDescription(
      "Write the question",
    );

    await user.click(screen.getByRole("button", { name: "Remove question" }));
    expect(screen.queryByRole("button", { name: /^Untitled question/ })).not.toBeInTheDocument();
  });
});

describe("Jumping to a problem", () => {
  it("Create opens the collapsed questions section, expands the question and focuses the field", async () => {
    const user = userEvent.setup();
    const setup = fixture();
    renderReview({
      ...setup,
      questions: setup.questions.map((q, i) => (i === 1 ? { ...q, label: "" } : q)),
    });
    expect(questionsToggle()).toHaveAttribute("aria-expanded", "false");

    await user.click(createButton());
    expect(
      screen.getAllByRole("alert").some((el) => /1 thing to fix before creating/.test(el.textContent)),
    ).toBe(true);
    expect(questionsToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Untitled question/, expanded: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Question/ })).toHaveFocus());
  });

  it("opens the groups section and a resource row from the problem list", async () => {
    const user = userEvent.setup();
    const setup = fixture();
    renderReview({
      ...setup,
      customerGroups: setup.customerGroups.map((g) => ({ ...g, name: "" })),
      resources: setup.resources.map((r, i) => (i === 2 ? { ...r, capacity: 0 } : r)),
    });
    const problem = (name: RegExp) =>
      must(screen.getAllByRole("button", { name })[0], `problem ${String(name)}`);
    await user.click(problem(/^Alex Morgan · Capacity/));
    expect(screen.getByRole("button", { name: /^Alex Morgan/, expanded: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /capacity/i })).toHaveFocus());

    await user.click(problem(/Give this group a name/));
    expect(groupsToggle()).toHaveAttribute("aria-expanded", "true");
  });
});
