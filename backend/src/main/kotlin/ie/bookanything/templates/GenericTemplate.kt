package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary

object GenericTemplate {
    private val ME = listOf("me")

    val template = Template(
        key = "generic",
        name = "Appointments (general)",
        description = "A simple setup for a one-person business: appointments and consultations, paid on the day.",
        icon = "calendar",
        keywords = listOf("appointment", "consultation"),
        setup = BusinessSetup(
            name = "My Business",
            industry = "generic",
            description = "Book an appointment or consultation online at a time that suits you.",
            vocabulary = Vocabulary("Staff member", "Staff", "Customer", "Customers", "Appointment", "Appointments"),
            branding = Branding(primaryColor = "#4f46e5"),
            policies = Policies(
                minNoticeMinutes = 60, maxAdvanceDays = 60, cancellationNoticeHours = 24, lateCancellationRefundPercent = 0,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 30, requireCustomerPhone = false,
            ),
            resources = listOf(
                SetupResource(
                    key = "me", kind = "person", name = "You",
                    description = "Your calendar. Rename this to your own name.",
                    weeklyHours = T.hours(T.WEEKDAYS, "09:00", "17:00"),
                ),
            ),
            services = listOf(
                SetupService(
                    name = "Appointment", category = "Appointments", color = "#4f46e5",
                    description = "A standard 30-minute appointment.",
                    durationMinutes = 30, bufferAfterMinutes = 0, slotIntervalMinutes = 30, priceCents = 3000, paymentMode = "at_venue",
                    requirements = listOf(SetupRequirement("Staff member", 1, resourceKeys = ME)),
                ),
                SetupService(
                    name = "Consultation", category = "Appointments", color = "#0ea5e9",
                    description = "A longer 60-minute consultation to talk through your needs in detail.",
                    durationMinutes = 60, bufferAfterMinutes = 0, slotIntervalMinutes = 30, priceCents = 5000, paymentMode = "at_venue",
                    requirements = listOf(SetupRequirement("Staff member", 1, resourceKeys = ME)),
                ),
            ),
            questions = listOf(
                SetupQuestion(label = "Anything we should know before your appointment?", kind = "textarea", required = false),
            ),
        ),
    )
}
