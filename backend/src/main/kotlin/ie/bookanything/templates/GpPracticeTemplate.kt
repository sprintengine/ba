package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary

object GpPracticeTemplate {
    private const val DOCTOR = "Doctor"
    private const val NURSE = "Nurse"
    private val DOCTORS = listOf("doctor-1", "doctor-2")

    /** Windows listing both groups are bookable by patients who pick a group (GMS is restricted to these). */
    private val ALL_PATIENTS = listOf("private", "gms")

    val template = Template(
        key = "gp_practice",
        name = "GP practice",
        description = "Doctor and nurse appointments for private and GMS / medical card patients, paid at the practice.",
        icon = "stethoscope",
        keywords = listOf(
            "gp", "general practice", "doctor", "doctors", "surgery", "medical", "clinic", "practice nurse", "medical card",
            "gms", "blood test", "smear",
        ),
        setup = BusinessSetup(
            name = "Oakfield Medical Practice",
            industry = "gp_practice",
            description = "A friendly family GP practice offering doctor consultations, nurse appointments, blood tests and cervical " +
                "screening.",
            vocabulary = Vocabulary("Clinician", "Clinicians", "Patient", "Patients", "Appointment", "Appointments"),
            branding = Branding(primaryColor = "#15803d"),
            policies = Policies(
                minNoticeMinutes = 30, maxAdvanceDays = 28, cancellationNoticeHours = 4, lateCancellationRefundPercent = 0,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 15, requireCustomerPhone = true,
            ),
            customerGroups = listOf(
                SetupGroup(
                    key = "private", name = "Private patient", description = "Patients paying the standard consultation fee.",
                    restricted = false,
                ),
                SetupGroup(
                    key = "gms", name = "GMS / medical card holder",
                    description = "Medical card and GP visit card holders. Only appointment times reserved for card holders are shown.",
                    restricted = true,
                ),
            ),
            resources = listOf(
                SetupResource(
                    key = "doctor-1", kind = "person", name = "Dr Alex Morgan",
                    description = "GP with a special interest in women's health and family medicine.",
                    weeklyHours = T.hours(T.WEEKDAYS, "09:00", "13:00", ALL_PATIENTS) + T.hours(listOf(1, 2, 3, 4), "14:00", "17:30"),
                ),
                SetupResource(
                    key = "doctor-2", kind = "person", name = "Dr Casey Lane",
                    description = "GP with a special interest in sports medicine and chronic disease management.",
                    weeklyHours = T.hours(listOf(1, 2, 3, 4), "10:00", "13:00", ALL_PATIENTS) +
                        T.hours(listOf(2, 3, 4, 5), "14:00", "18:00"),
                ),
                SetupResource(
                    key = "nurse-1", kind = "person", name = "Morgan Reid",
                    description = "Practice nurse: bloods, cervical screening, vaccinations and wound care.",
                    weeklyHours = T.hours(T.WEEKDAYS, "08:30", "12:30", ALL_PATIENTS) + T.hours(listOf(1, 3, 4), "13:30", "16:30"),
                ),
            ),
            services = listOf(
                SetupService(
                    name = "GP consultation", category = "Doctor", color = "#15803d",
                    description = "A standard consultation with a GP for a single issue. " +
                        "Please book a separate appointment for each person.",
                    durationMinutes = 15, slotIntervalMinutes = 15, priceCents = 6000, paymentMode = "at_venue",
                    requirements = listOf(SetupRequirement(DOCTOR, 1, customerSelectable = true, resourceKeys = DOCTORS)),
                ),
                SetupService(
                    name = "Nurse appointment", category = "Nurse", color = "#0d9488",
                    description = "Vaccinations, dressings, blood pressure checks and general nurse care.",
                    durationMinutes = 15, slotIntervalMinutes = 15, priceCents = 3000, paymentMode = "at_venue",
                    requirements = listOf(SetupRequirement(NURSE, 1, resourceKeys = listOf("nurse-1"))),
                ),
                SetupService(
                    name = "Blood test", category = "Nurse", color = "#dc2626",
                    description = "Blood sample taken by the practice nurse. Follow any fasting instructions from your doctor.",
                    durationMinutes = 10, slotIntervalMinutes = 10, priceCents = 2500, paymentMode = "at_venue",
                    requirements = listOf(SetupRequirement(NURSE, 1, resourceKeys = listOf("nurse-1"))),
                ),
                SetupService(
                    name = "Smear test", category = "Nurse", color = "#db2777",
                    description = "Cervical screening with the practice nurse. Free for eligible patients under the national screening " +
                        "programme.",
                    durationMinutes = 20, slotIntervalMinutes = 10, priceCents = 0, paymentMode = "at_venue",
                    requirements = listOf(SetupRequirement(NURSE, 1, resourceKeys = listOf("nurse-1"))),
                ),
            ),
            questions = listOf(
                SetupQuestion(
                    label = "Reason for visit", kind = "textarea", required = false, sensitive = true,
                    helpText = "Optional. A brief note helps the clinician prepare. Only practice staff can see this.",
                ),
            ),
        ),
    )
}
