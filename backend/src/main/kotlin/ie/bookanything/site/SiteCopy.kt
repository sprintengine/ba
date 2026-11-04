package ie.bookanything.site

import ie.bookanything.business.BusinessRow

/** Wording derived from the business's own vocabulary and details. Never adds facts. */
class SiteCopy(private val b: BusinessRow) {
    /** "appointment", "lesson"; "visit" when the business calls them "bookings". */
    val bookingWord: String = b.vocabulary.booking.trim().lowercase().let { if (it.isEmpty() || it == "booking") "visit" else it }
    val customersWord: String = b.vocabulary.customers.trim().lowercase().ifEmpty { "customers" }
    val resourceWord: String = b.vocabulary.resource.trim().lowercase().ifEmpty { "staff member" }
    val hasAddress: Boolean = !b.address.line1.isNullOrBlank() || !b.address.city.isNullOrBlank()
    val hasPhone: Boolean = !b.contactPhone.isNullOrBlank()
    val hasEmail: Boolean = !b.contactEmail.isNullOrBlank()
    private val city: String? = b.address.city?.trim()?.takeIf { it.isNotEmpty() }

    private fun article(word: String) = if (word.firstOrNull() in VOWELS) "an" else "a"

    /** "Book an appointment", "Book a lesson"; "Book now" when the vocabulary is generic or too long. */
    fun ctaLabel(): String {
        val word = b.vocabulary.booking.trim().lowercase()
        if (word.isEmpty() || word == "booking") return DEFAULT_CTA_LABEL
        return "Book ${article(word)} $word".takeIf { it.length <= 30 } ?: DEFAULT_CTA_LABEL
    }

    /** "Physiotherapy" for known industries, a humanized slug for others, null for generic. */
    fun industryLabel(): String? = INDUSTRY_LABELS[b.industry]
        ?: b.industry.takeIf { it != "generic" }?.replace('_', ' ')?.replace('-', ' ')?.trim()
            ?.replaceFirstChar { it.uppercase() }?.takeIf { it.length in 2..40 }

    fun eyebrow(): String? {
        val label = industryLabel()
        return when {
            label != null && city != null -> "$label in $city"
            label != null -> label
            city != null -> "Based in $city"
            else -> null
        }?.takeIf { it.length <= 60 }
    }

    fun servicesHeading(): String = SERVICES_HEADINGS[b.industry] ?: "Services"

    fun seoTitle(): String {
        val label = industryLabel()
        return listOfNotNull(
            if (label != null && city != null) "${b.name} | $label in $city" else null,
            city?.let { "${b.name} | $it" },
            label?.let { "${b.name} | $it" },
        ).firstOrNull { it.length <= 70 } ?: SiteText.truncate(b.name, 70)
    }

    fun seoDescription(): String {
        val label = industryLabel()
        val lead = when {
            label != null && city != null -> "$label in $city. "
            label != null -> "$label. "
            else -> ""
        }
        return SiteText.truncate("${lead}Book online with ${b.name}: see services and available times and choose what suits you.", 160)
    }

    private companion object {
        val VOWELS = setOf('a', 'e', 'i', 'o', 'u')
        val INDUSTRY_LABELS = mapOf(
            "physio" to "Physiotherapy", "gp_practice" to "GP practice", "car_wash" to "Car wash and valeting",
            "music_lessons" to "Music lessons", "salon" to "Hair and beauty", "fitness_class" to "Fitness classes",
        )
        val SERVICES_HEADINGS = mapOf(
            "physio" to "Treatments", "car_wash" to "Washes and valets", "music_lessons" to "Lessons",
            "gp_practice" to "Appointments", "fitness_class" to "Classes",
        )
    }
}
