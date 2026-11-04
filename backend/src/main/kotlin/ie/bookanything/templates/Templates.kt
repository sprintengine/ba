package ie.bookanything.templates

/** An industry template: a complete BusinessSetup plus metadata for the picker and AI fallback. */
data class Template(
    val key: String,
    val name: String,
    val description: String,
    /** Lucide icon name for the frontend picker. */
    val icon: String,
    /** Lowercase keywords used by the template fallback of the AI draft. */
    val keywords: List<String>,
    val setup: BusinessSetup,
) {
    fun summary() = TemplateSummary(key, name, description, icon)
}

object Templates {
    val all: List<Template> = listOf(
        PhysioTemplate.template,
        CarWashTemplate.template,
        MusicLessonsTemplate.template,
        GpPracticeTemplate.template,
        SalonTemplate.template,
        FitnessClassTemplate.template,
        GenericTemplate.template,
    )

    fun byKey(key: String): Template? = all.firstOrNull { it.key == key }
}

/** Helpers to keep template definitions compact. */
internal object T {
    val WEEKDAYS = listOf(1, 2, 3, 4, 5)
    fun hours(days: List<Int>, start: String, end: String, groups: List<String> = emptyList()) =
        days.map { SetupWeeklyHours(it, start, end, groups) }
    fun day(day: Int, start: String, end: String, groups: List<String> = emptyList()) = SetupWeeklyHours(day, start, end, groups)
}
