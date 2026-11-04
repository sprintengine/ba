package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.services.ServiceAddonInput
import ie.bookanything.services.ServiceOptionInput

object CarWashTemplate {
    private const val BAY = "Bay"
    private val BAYS = listOf("bay-1", "bay-2")
    private val BAY_HOURS = T.hours(listOf(1, 2, 3, 4, 5, 6), "08:00", "18:00") + T.day(7, "10:00", "16:00")

    val template = Template(
        key = "car_wash",
        name = "Car wash and valeting",
        description = "Exterior washes and full valets across two wash bays, priced by vehicle size, with optional extras.",
        icon = "car",
        keywords = listOf(
            "car wash", "carwash", "valet", "valeting", "detailing", "car detailing", "wash bay", "vehicle", "car cleaning",
            "hand wash",
        ),
        setup = BusinessSetup(
            name = "Gleam Car Wash",
            industry = "car_wash",
            description = "Hand car wash and valeting. Book a bay, drop in on time, and drive away spotless.",
            vocabulary = Vocabulary("Bay", "Bays", "Customer", "Customers", "Booking", "Bookings"),
            branding = Branding(primaryColor = "#0369a1"),
            policies = Policies(
                minNoticeMinutes = 60, maxAdvanceDays = 30, cancellationNoticeHours = 12, lateCancellationRefundPercent = 0,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 20, requireCustomerPhone = true,
            ),
            resources = listOf(
                SetupResource(
                    key = "bay-1", kind = "space", name = "Bay 1",
                    description = "Covered wash bay with pressure washer and vacuum station.",
                    weeklyHours = BAY_HOURS,
                ),
                SetupResource(
                    key = "bay-2", kind = "space", name = "Bay 2",
                    description = "Covered wash bay, suitable for larger vans and SUVs.",
                    weeklyHours = BAY_HOURS,
                ),
            ),
            services = listOf(
                SetupService(
                    name = "Exterior wash", category = "Wash", color = "#0ea5e9",
                    description = "Snow foam pre-wash, hand wash, wheel clean and hand dry. Ideal for a quick weekly clean.",
                    durationMinutes = 30, bufferAfterMinutes = 10, slotIntervalMinutes = 15, priceCents = 1500, paymentMode = "full",
                    requirements = listOf(SetupRequirement(BAY, 1, resourceKeys = BAYS)),
                ),
                SetupService(
                    name = "Full valet", category = "Valet", color = "#0369a1",
                    description =
                    "Exterior hand wash plus a full interior clean: vacuum, dashboard and trim, windows inside and out, and door shuts. " +
                        "A deposit secures your slot and the balance is paid on collection.",
                    durationMinutes = 90, bufferAfterMinutes = 10, slotIntervalMinutes = 30, priceCents = 6000,
                    paymentMode = "deposit", depositCents = 2000,
                    options = listOf(
                        ServiceOptionInput(
                            name = "Small car", description = "Hatchbacks and small city cars.", durationMinutes = 90,
                            priceCents = 6000, sortOrder = 0,
                        ),
                        ServiceOptionInput(
                            name = "Family car", description = "Saloons, estates and small crossovers.",
                            durationMinutes = 120, priceCents = 7500, sortOrder = 1,
                        ),
                        ServiceOptionInput(
                            name = "SUV / Van", description = "Large SUVs, 7-seaters and small vans.", durationMinutes = 150,
                            priceCents = 9500, sortOrder = 2,
                        ),
                    ),
                    addons = listOf(
                        ServiceAddonInput(
                            name = "Wax", description = "Hand-applied carnauba wax for shine and protection.",
                            extraMinutes = 20, priceCents = 2000, sortOrder = 0,
                        ),
                        ServiceAddonInput(
                            name = "Interior shampoo", description = "Deep shampoo of seats and carpets to lift stains.",
                            extraMinutes = 45, priceCents = 3500, sortOrder = 1,
                        ),
                    ),
                    requirements = listOf(SetupRequirement(BAY, 1, resourceKeys = BAYS)),
                ),
            ),
            questions = listOf(
                SetupQuestion(
                    label = "Vehicle registration", kind = "text", required = true,
                    helpText = "So we can recognise your car when you arrive.",
                ),
                SetupQuestion(label = "Make and model", kind = "text", required = false, helpText = "For example: Ford Focus estate."),
            ),
        ),
    )
}
