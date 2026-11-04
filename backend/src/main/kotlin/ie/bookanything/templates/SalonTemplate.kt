package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.services.ServiceAddonInput
import ie.bookanything.services.ServiceOptionInput

object SalonTemplate {
    private const val STYLIST = "Stylist"
    private val STYLISTS = listOf("stylist-1", "stylist-2", "stylist-3")

    private val CONDITIONING = ServiceAddonInput(
        name = "Deep conditioning treatment", description = "Intensive treatment to restore moisture and shine.",
        extraMinutes = 15, priceCents = 1500, sortOrder = 0,
    )

    val template = Template(
        key = "salon",
        name = "Hair salon",
        description = "Cuts, colour and blow-dries with a choice of stylist, priced by hair length, with a deposit for colour.",
        icon = "scissors",
        keywords = listOf(
            "salon", "hair", "hairdresser", "hairdressing", "stylist", "barber", "haircut", "blow-dry", "blow dry", "colour",
            "highlights", "beauty",
        ),
        setup = BusinessSetup(
            name = "Studio Nine Hair",
            industry = "salon",
            description = "A relaxed, modern hair salon for cuts, colour and styling.",
            vocabulary = Vocabulary("Stylist", "Stylists", "Client", "Clients", "Appointment", "Appointments"),
            branding = Branding(primaryColor = "#be185d"),
            policies = Policies(
                minNoticeMinutes = 120, maxAdvanceDays = 60, cancellationNoticeHours = 24, lateCancellationRefundPercent = 0,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 20, requireCustomerPhone = true,
            ),
            resources = listOf(
                SetupResource(
                    key = "stylist-1", kind = "person", name = "Casey Lane",
                    description = "Senior stylist. Precision cuts and bridal styling.",
                    weeklyHours = T.hours(listOf(2, 3, 4, 5), "09:00", "18:00") + T.day(6, "09:00", "17:00"),
                ),
                SetupResource(
                    key = "stylist-2", kind = "person", name = "Jordan Casey",
                    description = "Colour specialist: balayage, highlights and colour correction.",
                    weeklyHours = T.hours(listOf(2, 3), "10:00", "19:00") + T.hours(listOf(4, 5), "11:00", "20:00") + T.day(
                        6, "09:00",
                        "17:00",
                    ),
                ),
                SetupResource(
                    key = "stylist-3", kind = "person", name = "Taylor Quinn",
                    description = "Stylist. Short cuts, restyles and blow-dries.",
                    weeklyHours = T.hours(listOf(1, 2, 3, 4), "09:00", "17:30") + T.day(6, "09:00", "14:00"),
                ),
            ),
            services = listOf(
                SetupService(
                    name = "Cut & finish", category = "Cuts", color = "#be185d",
                    description = "Consultation, wash, cut and blow-dry finish.",
                    durationMinutes = 30, bufferAfterMinutes = 10, slotIntervalMinutes = 15, priceCents = 3500, paymentMode = "full",
                    options = listOf(
                        ServiceOptionInput(name = "Short hair", durationMinutes = 30, priceCents = 3500, sortOrder = 0),
                        ServiceOptionInput(name = "Medium hair", durationMinutes = 45, priceCents = 4500, sortOrder = 1),
                        ServiceOptionInput(name = "Long hair", durationMinutes = 60, priceCents = 5500, sortOrder = 2),
                    ),
                    addons = listOf(CONDITIONING),
                    requirements = listOf(SetupRequirement(STYLIST, 1, customerSelectable = true, resourceKeys = STYLISTS)),
                ),
                SetupService(
                    name = "Colour", category = "Colour", color = "#9333ea",
                    description =
                    "Full head colour or highlights with a blow-dry finish. New colour clients need a patch test at least 48 hours " +
                        "before. " +
                        "A deposit secures your appointment; the balance is paid in the salon.",
                    durationMinutes = 120, bufferAfterMinutes = 10, slotIntervalMinutes = 15, priceCents = 9000,
                    paymentMode = "deposit", depositCents = 2500, requiresApproval = false,
                    options = listOf(
                        ServiceOptionInput(name = "Root touch-up", durationMinutes = 90, priceCents = 7000, sortOrder = 0),
                        ServiceOptionInput(name = "Full head colour", durationMinutes = 120, priceCents = 9000, sortOrder = 1),
                        ServiceOptionInput(name = "Highlights", durationMinutes = 150, priceCents = 12000, sortOrder = 2),
                    ),
                    addons = listOf(CONDITIONING),
                    requirements = listOf(SetupRequirement(STYLIST, 1, customerSelectable = true, resourceKeys = STYLISTS)),
                ),
                SetupService(
                    name = "Blow-dry", category = "Styling", color = "#f472b6",
                    description = "Wash and blow-dry, straight or with volume and waves.",
                    durationMinutes = 45, bufferAfterMinutes = 10, slotIntervalMinutes = 15, priceCents = 3000, paymentMode = "full",
                    addons = listOf(CONDITIONING),
                    requirements = listOf(SetupRequirement(STYLIST, 1, customerSelectable = true, resourceKeys = STYLISTS)),
                ),
            ),
            questions = listOf(
                SetupQuestion(
                    label = "Any allergies or sensitivities to hair products?", kind = "textarea", required = false, sensitive = true,
                    helpText = "Let us know about any reactions to dyes, fragrances or other products.",
                ),
            ),
        ),
    )
}
