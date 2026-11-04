import { expect, test } from "@playwright/test";
import { authHeader, requireLiveBackend, signInAs } from "./dashboard-helpers";
import {
  action,
  createBusiness,
  flow,
  newIdentity,
  openMyBookings,
  ownerApi,
  payOnDevCheckout,
  reference,
  withService,
} from "./journey-helpers";

/**
 * A full customer journey per test industry, each on its own throwaway business (see journey-helpers), on desktop
 * and mobile.
 */
test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
});

test("car wash: an SUV valet with wax pays the deposit online and the rest at the wash", async ({
  page,
  request,
}) => {
  const wash = await createBusiness(request, "car_wash");
  const guest = newIdentity("carwash", "Riley Example");

  await flow.open(page, wash.slug);
  await flow.service(page, /Full valet/);
  await flow.option(page, /SUV \/ Van/);
  await flow.addon(page, /Wax/);
  await flow.continue(page);
  await flow.firstTime(page);
  await flow.details(page, guest, { "Vehicle registration": "261-D-12345" });

  // SUV (€95) + wax (€20); the deposit is fixed at €20 and the rest is paid at the wash.
  const payment = page.getByRole("definition");
  await expect(payment.filter({ hasText: /^€115$/, visible: true }).first()).toBeVisible(); // total
  await expect(payment.filter({ hasText: /^€95$/, visible: true }).first()).toBeVisible(); // at the wash
  await expect(flow.submit(page)).toHaveText(/Continue to payment · €20$/);
  await flow.submit(page).click();
  await payOnDevCheckout(page);

  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });
  await expect(reference(page)).toBeVisible();
  const booked = page.getByRole("region", { name: "Your booking" });
  await expect(
    booked
      .getByRole("definition")
      .filter({ hasText: "€115 · €20 deposit paid · €95 due at your appointment" }),
  ).toBeVisible();
  // The SUV option's 150 minutes plus the wax's 20.
  await expect(booked.getByRole("definition").filter({ hasText: "(2 h 50 min)" })).toBeVisible();

  const [booking] = await ownerApi.bookings(request, wash);
  expect(booking).toMatchObject({
    status: "confirmed",
    priceCents: 11_500,
    depositCents: 2_000,
    amountPaidCents: 2_000,
    option: { name: "SUV / Van" },
  });
  expect((booking!.addons as Array<{ name: string }>).map((a) => a.name)).toEqual(["Wax"]);
});

test("car wash offering its next available time only: a customer skips the first time and books the next", async ({
  page,
  request,
}) => {
  const wash = await createBusiness(request, "car_wash", (setup) => ({
    ...setup,
    policies: { ...(setup.policies as Record<string, unknown>), nextAvailableOnly: true },
  }));
  const guest = newIdentity("nextonly", "Sam Example");

  await flow.open(page, wash.slug);
  await flow.service(page, /Exterior wash/);
  const earliest = page.getByRole("region", { name: "Next available" });
  await expect(earliest).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("grid", { name: "Choose a date" })).toHaveCount(0);
  const firstOffer = (await earliest.textContent()) ?? "";

  await earliest.getByRole("button", { name: /Show a later time/ }).click();
  const later = page.getByRole("region", { name: "Next available after that" });
  await expect(later).toBeVisible();
  await expect(later).not.toHaveText(firstOffer);
  await later.getByRole("button", { name: "Book this time" }).click();
  await expect(flow.heading(page, "Your details")).toBeVisible();
  const chosen = flow.chosen(page);
  await flow.details(page, guest, { "Vehicle registration": "261-D-54321" });
  await flow.submit(page).click();
  await payOnDevCheckout(page);
  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });

  const [booking] = await ownerApi.bookings(request, wash);
  expect(String(booking!.start)).toContain(`${chosen.date}T${chosen.time}`);
});

test("physio: a guest pays for an assessment, signs in later and finds it in My bookings", async ({
  page,
  request,
}) => {
  const clinic = await createBusiness(request, "physio");
  const guest = newIdentity("physio", "Jamie Example");

  await flow.open(page, clinic.slug);
  await flow.service(page, /Initial assessment/);
  await flow.anyResourceIfAsked(page);
  await flow.firstTime(page);
  await flow.details(page, guest, {
    "What would you like help with?": "Stiff lower back after a long drive.",
    "Have you had surgery on this area in the last 12 months?": "No",
  });
  await expect(flow.submit(page)).toHaveText(/Continue to payment · €70$/);
  await flow.submit(page).click();
  await payOnDevCheckout(page);
  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });
  const ref = (await reference(page).textContent())?.trim() ?? "";

  // Later, the same person creates an account with that email: the booking is theirs.
  await openMyBookings(page, guest);
  const card = page
    .getByRole("article")
    .filter({ hasText: clinic.name })
    .filter({ hasText: /Initial assessment/ });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByRole("tab", { name: /Upcoming/ })).toHaveAttribute("aria-selected", "true");
  const [booking] = await ownerApi.bookings(request, clinic);
  expect(booking).toMatchObject({ reference: ref, status: "confirmed", amountPaidCents: 7_000 });
});

test("music lessons: a student books the same lesson three weeks running and sees them all", async ({
  page,
  request,
}) => {
  // Lessons are paid at the school here, so the three bookings need no checkout.
  const school = await createBusiness(request, "music_lessons", (setup) =>
    withService(setup, "Lesson", () => ({ paymentMode: "at_venue", depositCents: null })),
  );
  const student = newIdentity("music", "Robin Example");
  const answers = { Instrument: "Piano", Level: "Beginner", "Student's age": "12" };

  await flow.open(page, school.slug);
  await flow.group(page, /Existing students/);
  await flow.service(page, /^Lesson/);
  await flow.option(page, /45 minutes/);
  await flow.continue(page);
  await flow.resource(page, /Jordan Casey/);
  await flow.firstTime(page);
  const first = flow.chosen(page);
  const params = new URL(page.url()).searchParams;
  await flow.details(page, student, answers);
  await expect(flow.submit(page)).toHaveText(/^Confirm lesson$/); // the school calls bookings lessons;
  await flow.submit(page).click();
  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });

  // The same weekday and time for the next two weeks, from a booking link that keeps every choice.
  for (const week of [1, 2]) {
    const date = new Date(`${first.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 7 * week);
    const next = new URLSearchParams(params);
    next.set("date", date.toISOString().slice(0, 10));
    next.set("time", first.time);
    next.delete("step");
    await flow.open(page, school.slug, next.toString());
    await flow.details(page, student, answers);
    await flow.submit(page).click();
    await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible({ timeout: 15_000 });
  }

  const lessons = (await ownerApi.bookings(request, school)).filter((b) => b.status === "confirmed");
  expect(lessons).toHaveLength(3);
  const starts = lessons.map((b) => new Date(String(b.start)).getTime()).sort((a, b) => a - b);
  // A week apart (Dublin time: 7 days, give or take an hour across a clock change).
  for (const [i, start] of starts.slice(1).entries()) {
    expect(Math.abs(start - starts[i]! - 7 * 86_400_000)).toBeLessThanOrEqual(3_600_000);
  }

  await openMyBookings(page, student);
  await expect(page.getByRole("article").filter({ hasText: school.name })).toHaveCount(3, {
    timeout: 15_000,
  });
});

test("GP practice: a medical card holder requests an appointment and the practice approves it", async ({
  page,
  request,
}) => {
  const practice = await createBusiness(request, "gp_practice", (setup) =>
    withService(setup, "GP consultation", () => ({ requiresApproval: true })),
  );
  const patient = newIdentity("gp", "Sam Example");

  await flow.open(page, practice.slug);
  await flow.group(page, /GMS \/ medical card holder/);
  await flow.service(page, /GP consultation/);
  await flow.anyResourceIfAsked(page);
  await flow.firstTime(page);
  await flow.details(page, patient);
  await expect(flow.submit(page)).toHaveText(/^Send request$/);
  await flow.submit(page).click();
  await expect(page).toHaveURL(/\/manage\//, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  const appointment = page.getByRole("region", { name: "Your appointment" }); // the practice's word for a booking
  await expect(appointment.getByText("Needs approval")).toBeVisible();
  const manageUrl = page.url();

  const [requested] = await ownerApi.bookings(request, practice);
  expect(requested).toMatchObject({ status: "pending_approval" });
  expect(requested!.groupId).toBeTruthy();

  // The practice approves it from the dashboard overview.
  await signInAs(page, practice.owner);
  await page.goto(`/dashboard/${practice.slug}`);
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect
    .poll(async () => (await ownerApi.bookings(request, practice))[0]?.status, { timeout: 15_000 })
    .toBe("confirmed");

  await page.goto(manageUrl);
  await expect(appointment.getByText("Confirmed")).toBeVisible({ timeout: 15_000 });
});

test("team: the owner invites a therapist, who signs in and lands on their calendar", async ({
  page,
  request,
}) => {
  const clinic = await createBusiness(request, "physio");
  const therapist = newIdentity("staff", "Morgan Example");

  await signInAs(page, clinic.owner);
  await page.goto(`/dashboard/${clinic.slug}/team`);
  await action(page, /^Invite$/).click();
  const dialog = page.getByRole("dialog", { name: `Invite to ${clinic.name}` });
  await dialog.getByRole("textbox", { name: /^Email/ }).fill(therapist.email);
  await dialog.getByRole("radio", { name: /^Staff/ }).click();
  await dialog.getByRole("combobox", { name: /Their calendar/ }).click();
  await page.getByRole("option", { name: "Sam Rivers" }).click();
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(therapist.email).first()).toBeVisible();

  // The invitation goes to that email; signing in with it accepts it (the later sign-in replaces the owner).
  await signInAs(page, therapist);
  await page.goto(`/dashboard/${clinic.slug}/calendar`);
  await expect(page.getByRole("radiogroup", { name: "Calendar view" })).toBeVisible({ timeout: 20_000 });
  const team = await request.get(`/api/v1/businesses/${clinic.id}/team`, {
    headers: authHeader(clinic.owner),
  });
  const member = (
    (await team.json()) as Array<{ email: string; role: string; status: string; resourceId: string | null }>
  ).find((m) => m.email === therapist.email);
  expect(member).toMatchObject({ role: "staff", status: "active" });
  expect(member!.resourceId).toBeTruthy();
});
