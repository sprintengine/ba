import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import {
  buildDetailsSchema,
  detailsResolver,
  EMPTY_DETAILS,
  type DetailsValues,
  type Question,
} from "@/lib/booking/details-schema";
import { expectNoAxeViolations } from "@/test/axe";
import { DETAILS_FORM_ID, DetailsStep } from "../details-step";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/lumen-physio/book",
  useSearchParams: () => new URLSearchParams(),
}));

const question = (patch: Partial<Question> & Pick<Question, "id" | "label" | "kind">): Question => ({
  helpText: null,
  options: [],
  required: false,
  sensitive: false,
  sortOrder: 1,
  ...patch,
});

/** One question of every kind. */
const QUESTIONS: Question[] = [
  question({ id: "q-text", label: "Where did you hear about us?", kind: "text" }),
  question({
    id: "q-area",
    label: "What would you like help with?",
    kind: "textarea",
    required: true,
    sensitive: true,
  }),
  question({
    id: "q-select",
    label: "Experience",
    kind: "select",
    options: ["New", "Returning"],
    required: true,
  }),
  question({ id: "q-number", label: "Age", kind: "number" }),
  question({ id: "q-email", label: "GP email", kind: "email", helpText: "We'll send them a summary." }),
  question({ id: "q-phone", label: "Emergency contact", kind: "phone" }),
  question({ id: "q-consent", label: "I agree to the treatment terms", kind: "checkbox", required: true }),
];

function Harness({
  questions = [],
  requirePhone = false,
  signedInAs = null,
  onSubmit,
}: {
  questions?: Question[];
  requirePhone?: boolean;
  signedInAs?: { name: string | null; email: string } | null;
  onSubmit: (values: DetailsValues) => void;
}) {
  const form = useForm<DetailsValues>({
    resolver: detailsResolver(buildDetailsSchema({ requirePhone, questions })),
    defaultValues: EMPTY_DETAILS,
    mode: "onTouched",
  });
  return (
    <>
      <DetailsStep
        form={form}
        onSubmit={onSubmit}
        questions={questions}
        requirePhone={requirePhone}
        businessName="Lumen Physiotherapy"
        signedInAs={signedInAs}
        signInHref="/sign-in?redirect_url=%2Flumen-physio%2Fbook"
      />
      <button type="submit" form={DETAILS_FORM_ID}>
        Review
      </button>
      <button
        type="button"
        onClick={() => {
          // What the booking flow does with a 400 INVALID_REQUEST: `customer.email` → `email` etc.
          form.setError("email", { message: "This email address can't receive mail" });
          form.setError("answers.q-area", { message: "Tell us a little more" });
        }}
      >
        Simulate server errors
      </button>
    </>
  );
}

function renderDetails(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onSubmit = vi.fn();
  const view = render(<Harness onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...view };
}

/** The error shown under a control, via its aria-describedby. */
function errorFor(control: HTMLElement): string {
  const ids = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  return ids
    .map((id) => document.getElementById(id))
    .filter((el) => el?.getAttribute("role") === "alert")
    .map((el) => el?.textContent ?? "")
    .join(" ");
}

describe("DetailsStep validation", () => {
  it("shows each required field's message under it, marks it invalid and focuses the first", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDetails({ requirePhone: true });
    await user.click(screen.getByRole("button", { name: "Review" }));

    const name = screen.getByRole("textbox", { name: /Full name/ });
    const email = screen.getByRole("textbox", { name: /^Email/ });
    const phone = screen.getByRole("textbox", { name: /^Phone/ });
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(errorFor(name)).toBe("Enter your name");
    expect(errorFor(email)).toBe("Enter your email");
    expect(errorFor(phone)).toBe("Enter a phone number");
    expect(name).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("focuses an unanswered required choice or checkbox, so submitting never silently does nothing", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDetails({ questions: QUESTIONS });
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Alex Morgan");
    await user.type(screen.getByRole("textbox", { name: /^Email/ }), "alex.morgan@example.com");
    await user.type(screen.getByRole("textbox", { name: /What would you like help with/ }), "Sore knee");

    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: /Experience/ })).toHaveFocus());

    await user.click(screen.getByRole("combobox", { name: /Experience/ }));
    await user.click(await screen.findByRole("option", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /I agree to the treatment terms/ })).toHaveFocus(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("checks the email and phone formats", async () => {
    const user = userEvent.setup();
    renderDetails();
    const email = screen.getByRole("textbox", { name: /^Email/ });
    const phone = screen.getByRole("textbox", { name: /^Phone/ });
    await user.type(email, "alex@example");
    await user.type(phone, "call me");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(errorFor(email)).toBe("Enter a valid email address"));
    expect(errorFor(phone)).toBe("Enter a valid phone number");
  });

  it("keeps the name within the backend's 120 characters", async () => {
    const user = userEvent.setup();
    renderDetails();
    const name = screen.getByRole("textbox", { name: /Full name/ });
    await user.click(name);
    await user.paste("A".repeat(121));
    await user.tab();
    await waitFor(() => expect(errorFor(name)).toBe("Keep it under 120 characters"));
  });

  it("validates on leaving a field, then clears the error once fixed", async () => {
    const user = userEvent.setup();
    renderDetails();
    const email = screen.getByRole("textbox", { name: /^Email/ });
    await user.type(email, "nope");
    await user.tab();
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    await user.type(email, "@example.com");
    await waitFor(() => expect(email).not.toHaveAttribute("aria-invalid"));
    expect(errorFor(email)).toBe("");
  });

  it("submits valid details; the phone is optional unless the business requires it", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDetails();
    expect(screen.getByRole("textbox", { name: /^Phone/ })).not.toBeRequired();
    expect(screen.getByText("For reminders or if plans change.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Alex Morgan");
    await user.type(screen.getByRole("textbox", { name: /^Email/ }), "alex.morgan@example.com");
    await user.type(screen.getByRole("textbox", { name: /Anything we should know/ }), "Ground floor please");
    // Enter in the notes is a new line, not a submit.
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: "Alex Morgan",
      email: "alex.morgan@example.com",
      phone: "",
      notes: "Ground floor please\n",
    });
  });

  it("explains why a required phone is needed", () => {
    renderDetails({ requirePhone: true });
    expect(screen.getByRole("textbox", { name: /^Phone/ })).toBeRequired();
    expect(screen.getByText("Lumen Physiotherapy may call if something changes.")).toBeInTheDocument();
  });

  it("puts server field errors under the right field (aria-invalid, described by the message)", async () => {
    const user = userEvent.setup();
    renderDetails({ questions: QUESTIONS });
    await user.click(screen.getByRole("button", { name: "Simulate server errors" }));
    const email = screen.getByRole("textbox", { name: /^Email/ });
    const help = screen.getByRole("textbox", { name: /What would you like help with/ });
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(errorFor(email)).toBe("This email address can't receive mail");
    expect(help).toHaveAttribute("aria-invalid", "true");
    expect(errorFor(help)).toBe("Tell us a little more");
    // The help text is still read, after the error is shown in its place.
    expect(email.getAttribute("aria-describedby")).toMatch(/-help/);
  });
});

describe("DetailsStep questions", () => {
  it("asks each question with the right control, required ones first to be answered", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDetails({ questions: QUESTIONS });

    expect(screen.getByRole("textbox", { name: /Where did you hear about us/ })).not.toBeRequired();
    expect(screen.getByRole("textbox", { name: /What would you like help with/ })).toBeRequired();
    expect(screen.getByRole("combobox", { name: /Experience/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Age/ })).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByRole("textbox", { name: /GP email/ })).toHaveAttribute("type", "email");
    expect(screen.getByRole("textbox", { name: /Emergency contact/ })).toHaveAttribute("type", "tel");
    expect(screen.getByRole("checkbox", { name: /I agree to the treatment terms/ })).not.toBeChecked();
    // Sensitive answers say who sees them.
    expect(screen.getByText("Only shared with Lumen Physiotherapy.")).toBeInTheDocument();
    expect(screen.getByText("We'll send them a summary.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review" }));
    const area = screen.getByRole("textbox", { name: /What would you like help with/ });
    await waitFor(() => expect(errorFor(area)).toBe("Please answer this question"));
    expect(errorFor(screen.getByRole("combobox", { name: /Experience/ }))).toBe("Choose an option");
    expect(errorFor(screen.getByRole("checkbox", { name: /I agree/ }))).toBe("Please confirm to continue");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("checks answer formats and submits the answers by question id", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDetails({ questions: QUESTIONS });
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Alex Morgan");
    await user.type(screen.getByRole("textbox", { name: /^Email/ }), "alex.morgan@example.com");
    await user.type(screen.getByRole("textbox", { name: /What would you like help with/ }), "Sore knee");
    const age = screen.getByRole("textbox", { name: /Age/ });
    const gp = screen.getByRole("textbox", { name: /GP email/ });
    const contact = screen.getByRole("textbox", { name: /Emergency contact/ });
    await user.type(age, "thirty");
    await user.type(gp, "doctor");
    await user.type(contact, "x");

    // The select opens with the keyboard and picks with Enter.
    const select = screen.getByRole("combobox", { name: /Experience/ });
    select.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Returning" }));
    await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
    await user.click(screen.getByRole("button", { name: "Review" }));

    await waitFor(() => expect(errorFor(age)).toBe("Enter a number"));
    expect(errorFor(gp)).toBe("Enter a valid email address");
    expect(errorFor(contact)).toBe("Enter a valid phone number");

    await user.clear(age);
    await user.type(age, "34");
    await user.clear(gp);
    await user.type(gp, "gp@example.ie");
    await user.clear(contact);
    await user.type(contact, "+353 87 123 4567");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].answers).toEqual({
      "q-area": "Sore knee",
      "q-select": "Returning",
      "q-number": "34",
      "q-email": "gp@example.ie",
      "q-phone": "+353 87 123 4567",
      "q-consent": "true",
    });
  });

  it("ticks and unticks a checkbox question with Space", async () => {
    const user = userEvent.setup();
    renderDetails({ questions: QUESTIONS });
    const consent = screen.getByRole("checkbox", { name: /I agree/ });
    consent.focus();
    await user.keyboard(" ");
    expect(consent).toBeChecked();
    await user.keyboard(" ");
    expect(consent).not.toBeChecked();
  });

  it("has no accessibility violations, with or without errors", async () => {
    const user = userEvent.setup();
    const { container } = renderDetails({ questions: QUESTIONS });
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Review" }));
    await screen.findAllByText("Please answer this question");
    await expectNoAxeViolations(container);
  });
});

describe("DetailsStep account", () => {
  it("offers to sign in, returning to the flow", () => {
    renderDetails();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Flumen-physio%2Fbook",
    );
  });

  it("says who is booking when signed in", () => {
    renderDetails({ signedInAs: { name: "Alex Morgan", email: "alex.morgan@example.com" } });
    expect(screen.queryByText(/Have an account/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("falls back to the email for an account without a name", () => {
    renderDetails({ signedInAs: { name: null, email: "alex.morgan@example.com" } });
    expect(screen.queryByText(/Have an account/)).not.toBeInTheDocument();
  });
});
