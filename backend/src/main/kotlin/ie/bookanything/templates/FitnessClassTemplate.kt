package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary

object FitnessClassTemplate {
    private const val INSTRUCTOR = "Instructor"
    private const val STUDIO = "Studio"
    private val INSTRUCTORS = listOf("instructor-1", "instructor-2")
    private val STUDIO_KEYS = listOf("studio")

    val template = Template(
        key = "fitness_class",
        name = "Fitness classes",
        description = "Small group classes such as yoga, HIIT and Pilates, with limited spaces per session and online payment.",
        icon = "dumbbell",
        keywords = listOf(
            "fitness", "gym", "class", "classes", "yoga", "pilates", "hiit", "bootcamp", "spinning", "workout", "studio",
            "personal trainer",
        ),
        setup = BusinessSetup(
            name = "Pulse Fitness Studio",
            industry = "fitness_class",
            description = "Energising small group classes for every fitness level, before work and in the evening.",
            vocabulary = Vocabulary("Instructor", "Instructors", "Member", "Members", "Booking", "Bookings"),
            branding = Branding(primaryColor = "#ea580c"),
            policies = Policies(
                minNoticeMinutes = 30, maxAdvanceDays = 14, cancellationNoticeHours = 6, lateCancellationRefundPercent = 0,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 15, requireCustomerPhone = false,
            ),
            resources = listOf(
                SetupResource(
                    key = "instructor-1", kind = "person", name = "Morgan Reid",
                    description = "Yoga and Pilates instructor.",
                    weeklyHours = T.hours(T.WEEKDAYS, "06:00", "09:00") + T.hours(listOf(1, 3, 5), "17:00", "21:00") + T.day(
                        6, "08:00",
                        "12:00",
                    ),
                ),
                SetupResource(
                    key = "instructor-2", kind = "person", name = "Alex Morgan",
                    description = "HIIT and strength coach.",
                    weeklyHours = T.hours(listOf(2, 4), "06:00", "09:00") + T.hours(listOf(1, 2, 3, 4), "17:00", "21:00") + T.day(
                        6,
                        "09:00", "12:00",
                    ),
                ),
                SetupResource(
                    key = "studio", kind = "space", name = "Studio",
                    description = "Main studio with mats, blocks, kettlebells and a sound system.",
                    weeklyHours = T.hours(T.WEEKDAYS, "06:00", "09:00") + T.hours(T.WEEKDAYS, "17:00", "21:00") + T.day(
                        6, "08:00",
                        "12:00",
                    ),
                ),
            ),
            services = listOf(
                SetupService(
                    name = "Yoga flow", category = "Mind & body", color = "#16a34a",
                    description = "A flowing vinyasa class linking breath and movement. All levels welcome; mats provided.",
                    durationMinutes = 60, slotIntervalMinutes = 60, capacity = 12, priceCents = 1200, paymentMode = "full",
                    requirements = listOf(
                        SetupRequirement(INSTRUCTOR, 1, resourceKeys = INSTRUCTORS),
                        SetupRequirement(STUDIO, 1, resourceKeys = STUDIO_KEYS),
                    ),
                ),
                SetupService(
                    name = "HIIT", category = "Cardio & strength", color = "#ea580c",
                    description = "High-intensity interval training to build fitness and strength fast. Options given for every level.",
                    durationMinutes = 45, slotIntervalMinutes = 60, capacity = 15, priceCents = 1200, paymentMode = "full",
                    requirements = listOf(
                        SetupRequirement(INSTRUCTOR, 1, resourceKeys = INSTRUCTORS),
                        SetupRequirement(STUDIO, 1, resourceKeys = STUDIO_KEYS),
                    ),
                ),
                SetupService(
                    name = "Pilates", category = "Mind & body", color = "#0891b2",
                    description = "Mat Pilates focusing on core strength, posture and control.",
                    durationMinutes = 50, slotIntervalMinutes = 60, capacity = 10, priceCents = 1400, paymentMode = "full",
                    requirements = listOf(
                        SetupRequirement(INSTRUCTOR, 1, resourceKeys = INSTRUCTORS),
                        SetupRequirement(STUDIO, 1, resourceKeys = STUDIO_KEYS),
                    ),
                ),
            ),
            questions = listOf(
                SetupQuestion(
                    label = "Any injuries or health conditions we should know about?", kind = "textarea", required = false,
                    sensitive = true,
                    helpText = "Your instructor can suggest modifications.",
                ),
            ),
        ),
    )
}
