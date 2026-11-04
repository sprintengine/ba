package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.services.ServiceOptionInput

object MusicLessonsTemplate {
    private const val TEACHER = "Teacher"
    private const val ROOM = "Room"
    private val TEACHERS = listOf("teacher-1", "teacher-2")

    val template = Template(
        key = "music_lessons",
        name = "Music lessons",
        description = "One-to-one lessons with a choice of teacher, a free trial lesson for new students, and lesson lengths of 30 to 60 " +
            "minutes.",
        icon = "music",
        keywords = listOf(
            "music", "lesson", "lessons", "piano", "guitar", "violin", "singing", "voice", "drums", "music teacher",
            "music school", "tuition",
        ),
        setup = BusinessSetup(
            name = "Harmony Music School",
            industry = "music_lessons",
            description = "Friendly one-to-one music tuition for children and adults, from first notes to exam grades.",
            vocabulary = Vocabulary("Teacher", "Teachers", "Student", "Students", "Lesson", "Lessons"),
            branding = Branding(primaryColor = "#7c3aed"),
            policies = Policies(
                minNoticeMinutes = 240, maxAdvanceDays = 45, cancellationNoticeHours = 24, lateCancellationRefundPercent = 0,
                allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 30, requireCustomerPhone = true,
            ),
            customerGroups = listOf(
                SetupGroup(
                    key = "existing", name = "Existing students", description = "Students who already take lessons with us.",
                    restricted = false,
                ),
                SetupGroup(
                    key = "new", name = "New students", description = "First time with us? Start with a free trial lesson.",
                    restricted = false,
                ),
            ),
            resources = listOf(
                SetupResource(
                    key = "teacher-1", kind = "person", name = "Jordan Casey",
                    description = "Piano and voice teacher. Prepares students for graded exams.",
                    weeklyHours = T.hours(listOf(1, 2, 3, 4), "14:00", "20:00") + T.day(6, "09:00", "13:00"),
                ),
                SetupResource(
                    key = "teacher-2", kind = "person", name = "Taylor Quinn",
                    description = "Guitar, drums and violin teacher. Loves rock, folk and trad.",
                    weeklyHours = T.hours(listOf(2, 3, 4, 5), "15:00", "21:00") + T.day(6, "10:00", "14:00"),
                ),
                SetupResource(
                    key = "practice-room", kind = "space", name = "Practice room",
                    description = "Soundproofed room with an upright piano and amplifiers.",
                    weeklyHours = T.hours(T.WEEKDAYS, "13:30", "21:00") + T.day(6, "09:00", "14:00"),
                ),
            ),
            services = listOf(
                SetupService(
                    name = "Trial lesson", category = "Lessons", color = "#a78bfa",
                    description = "A free 30-minute taster lesson for new students. Meet your teacher, try the instrument and talk about " +
                        "your goals.",
                    durationMinutes = 30, bufferAfterMinutes = 5, slotIntervalMinutes = 15, priceCents = 0, paymentMode = "free",
                    allowedGroupKeys = listOf("new"),
                    requirements = listOf(
                        SetupRequirement(TEACHER, 1, customerSelectable = true, resourceKeys = TEACHERS),
                        SetupRequirement(ROOM, 1, resourceKeys = listOf("practice-room")),
                    ),
                ),
                SetupService(
                    name = "Lesson", category = "Lessons", color = "#7c3aed",
                    description = "A one-to-one lesson tailored to your level, from complete beginner to advanced and exam preparation.",
                    durationMinutes = 30, bufferAfterMinutes = 5, slotIntervalMinutes = 15, priceCents = 2500, paymentMode = "full",
                    options = listOf(
                        ServiceOptionInput(name = "30 minutes", durationMinutes = 30, priceCents = 2500, sortOrder = 0),
                        ServiceOptionInput(name = "45 minutes", durationMinutes = 45, priceCents = 3500, sortOrder = 1),
                        ServiceOptionInput(name = "60 minutes", durationMinutes = 60, priceCents = 4500, sortOrder = 2),
                    ),
                    requirements = listOf(
                        SetupRequirement(TEACHER, 1, customerSelectable = true, resourceKeys = TEACHERS),
                        SetupRequirement(ROOM, 1, resourceKeys = listOf("practice-room")),
                    ),
                ),
            ),
            questions = listOf(
                SetupQuestion(
                    label = "Instrument", kind = "select", required = true,
                    options = listOf("Piano", "Guitar", "Violin", "Voice", "Drums", "Other"),
                ),
                SetupQuestion(
                    label = "Level", kind = "select", required = true,
                    options = listOf("Complete beginner", "Beginner", "Intermediate", "Advanced"),
                ),
                SetupQuestion(
                    label = "Student's age", kind = "number", required = true,
                    helpText = "Helps your teacher plan the right kind of lesson.",
                ),
            ),
        ),
    )
}
