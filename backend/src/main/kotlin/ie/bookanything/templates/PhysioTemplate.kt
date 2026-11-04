package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.services.ServiceOptionInput

object PhysioTemplate {
    private const val THERAPIST = "Therapist"
    private const val ROOM = "Room"

    val template = Template(
        key = "physio",
        name = "Physiotherapy clinic",
        description = "Assessments, follow-ups and sports massage with a therapist and a treatment room. Paid online when booking.",
        icon = "activity",
        keywords = listOf(
            "physio", "physiotherapy", "physiotherapist", "sports massage", "massage", "rehab", "osteopath", "chiropract",
            "injury", "back pain",
        ),
        setup = BusinessSetup(
            name = "Riverside Physiotherapy",
            industry = "physio",
            description = "Evidence-based physiotherapy for sports injuries, back and neck pain, and post-surgery rehabilitation.",
            vocabulary = Vocabulary("Therapist", "Therapists", "Client", "Clients", "Appointment", "Appointments"),
            branding = Branding(primaryColor = "#0f766e"),
            policies = Policies(
                minNoticeMinutes = 120, maxAdvanceDays = 60, cancellationNoticeHours = 24, lateCancellationRefundPercent = 50,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 30, requireCustomerPhone = true,
            ),
            resources = listOf(
                SetupResource(
                    key = "therapist-1", kind = "person", name = "Sam Rivers",
                    description = "Chartered physiotherapist. Special interest in running injuries and knee rehab.",
                    weeklyHours = T.hours(listOf(1, 2, 3, 4), "09:00", "17:30") + T.day(5, "09:00", "13:00"),
                ),
                SetupResource(
                    key = "therapist-2", kind = "person", name = "Robin Ashby",
                    description = "Physiotherapist and sports massage therapist. Works with field-sport athletes.",
                    weeklyHours = T.hours(listOf(2, 3, 4, 5), "12:00", "20:00") + T.day(6, "09:00", "13:00"),
                ),
                SetupResource(
                    key = "room-1", kind = "space", name = "Treatment room 1",
                    weeklyHours = T.hours(T.WEEKDAYS, "08:30", "20:00") + T.day(6, "08:30", "13:30"),
                ),
                SetupResource(
                    key = "room-2", kind = "space", name = "Treatment room 2",
                    weeklyHours = T.hours(T.WEEKDAYS, "08:30", "20:00") + T.day(6, "08:30", "13:30"),
                ),
            ),
            services = listOf(
                SetupService(
                    name = "Initial assessment", category = "Physiotherapy", color = "#0f766e",
                    description = "A full assessment of your injury or pain, a clear diagnosis and a treatment plan. Your first visit.",
                    durationMinutes = 60, bufferAfterMinutes = 10, slotIntervalMinutes = 30, priceCents = 7000, paymentMode = "full",
                    requirements = listOf(
                        SetupRequirement(THERAPIST, 1, customerSelectable = true, resourceKeys = listOf("therapist-1", "therapist-2")),
                        SetupRequirement(ROOM, 1, resourceKeys = listOf("room-1", "room-2")),
                    ),
                ),
                SetupService(
                    name = "Follow-up treatment", category = "Physiotherapy", color = "#14b8a6",
                    description = "Hands-on treatment and exercise progression for existing clients.",
                    durationMinutes = 45, bufferAfterMinutes = 5, slotIntervalMinutes = 15, priceCents = 6000, paymentMode = "full",
                    requirements = listOf(
                        SetupRequirement(THERAPIST, 1, customerSelectable = true, resourceKeys = listOf("therapist-1", "therapist-2")),
                        SetupRequirement(ROOM, 1, resourceKeys = listOf("room-1", "room-2")),
                    ),
                ),
                SetupService(
                    name = "Sports massage", category = "Massage", color = "#0ea5e9",
                    description = "Deep tissue sports massage to aid recovery and reduce muscle tension.",
                    durationMinutes = 30, bufferAfterMinutes = 5, slotIntervalMinutes = 15, priceCents = 4000, paymentMode = "full",
                    options = listOf(
                        ServiceOptionInput(name = "30 minutes", durationMinutes = 30, priceCents = 4000, sortOrder = 0),
                        ServiceOptionInput(name = "60 minutes", durationMinutes = 60, priceCents = 6500, sortOrder = 1),
                    ),
                    requirements = listOf(
                        SetupRequirement(THERAPIST, 1, customerSelectable = true, resourceKeys = listOf("therapist-1", "therapist-2")),
                        SetupRequirement(ROOM, 1, resourceKeys = listOf("room-1", "room-2")),
                    ),
                ),
            ),
            questions = listOf(
                SetupQuestion(
                    label = "What would you like help with?", kind = "textarea", required = true, sensitive = true,
                    helpText = "A short description of your injury or symptoms. Only your therapist will see this.",
                ),
                SetupQuestion(
                    label = "Have you had surgery on this area in the last 12 months?", kind = "select",
                    options = listOf("No", "Yes"), required = true, sensitive = true, serviceName = "Initial assessment",
                ),
                SetupQuestion(
                    label = "How did you hear about us?", kind = "select",
                    options = listOf("Search engine", "Friend or family", "GP or consultant referral", "Sports club", "Other"),
                ),
            ),
        ),
    )
}
