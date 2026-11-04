package ie.bookanything.marketplace

import kotlinx.serialization.Serializable

/**
 * One entry of the controlled marketplace taxonomy. [key] is the URL segment (`/explore/{city}/{key}`),
 * [industries] are the business `industry` values (template keys) that default to it, and [keywords] let a
 * free-text search ("physio", "valet") find the category.
 */
data class MarketplaceCategory(
    val key: String,
    val label: String,
    val plural: String,
    val industries: Set<String> = emptySet(),
    val keywords: List<String> = emptyList(),
)

@Serializable
data class CategoryDto(val key: String, val label: String, val plural: String)

/** The taxonomy. Adding a category is one entry here; the frontend reads it from `/v1/public/marketplace/meta`. */
object MarketplaceCategories {
    val OTHER = MarketplaceCategory("other", "Other services", "Other services", setOf("generic"))

    val ALL: List<MarketplaceCategory> = listOf(
        MarketplaceCategory(
            "physio", "Physiotherapy", "Physiotherapists", setOf("physio"),
            listOf("physio", "physiotherapy", "physiotherapist", "sports massage", "rehab", "injury"),
        ),
        MarketplaceCategory(
            "gp-practice", "GP practice", "GP practices", setOf("gp_practice"),
            listOf("gp", "doctor", "clinic", "medical", "nurse", "blood test"),
        ),
        MarketplaceCategory("dental", "Dental", "Dentists", setOf("dental"), listOf("dentist", "dental", "hygienist", "teeth")),
        MarketplaceCategory(
            "salon", "Hair and beauty", "Salons", setOf("salon"),
            listOf("salon", "hair", "hairdresser", "beauty", "nails", "colour", "blow dry"),
        ),
        MarketplaceCategory("barber", "Barber", "Barbers", setOf("barber"), listOf("barber", "haircut", "beard", "fade")),
        MarketplaceCategory(
            "massage", "Massage and wellness", "Massage and wellness", setOf("massage", "spa"),
            listOf("massage", "wellness", "spa", "reflexology"),
        ),
        MarketplaceCategory(
            "fitness", "Fitness", "Fitness studios", setOf("fitness_class", "gym", "yoga", "pilates"),
            listOf("fitness", "gym", "yoga", "pilates", "class", "personal trainer", "hiit", "spin"),
        ),
        MarketplaceCategory(
            "music-lessons", "Music lessons", "Music teachers", setOf("music_lessons"),
            listOf("music", "lesson", "piano", "guitar", "violin", "singing", "drums"),
        ),
        MarketplaceCategory("tutoring", "Tutoring", "Tutors", setOf("tutoring"), listOf("tutor", "grinds", "maths", "language")),
        MarketplaceCategory(
            "car-wash", "Car wash and valeting", "Car washes", setOf("car_wash"),
            listOf("car wash", "valet", "valeting", "detailing", "car"),
        ),
        MarketplaceCategory(
            "pet-grooming", "Pet grooming", "Pet groomers", setOf("pet_grooming"),
            listOf("dog", "grooming", "pet", "groomer"),
        ),
        OTHER,
    )

    private val byKey = ALL.associateBy { it.key }

    fun byKey(key: String?): MarketplaceCategory? = key?.let { byKey[it.trim().lowercase()] }

    /** The default category for a business industry; unknown industries are "other". */
    fun forIndustry(industry: String): MarketplaceCategory = ALL.firstOrNull { industry in it.industries } ?: OTHER

    /** Categories whose label or keywords match a free-text query (so "valet" finds car washes). */
    fun matching(query: String): List<MarketplaceCategory> {
        val q = query.trim().lowercase()
        if (q.length < 3) return emptyList()
        val words = q.split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }.toSet()

        // A keyword matches when the query is its prefix ("phys") or all its words appear in the query ("sports massage dublin").
        fun keywordMatches(kw: String) = kw.startsWith(q) || kw.split(' ').all { it in words }
        return ALL.filter { c ->
            c.label.lowercase().startsWith(q) || c.plural.lowercase().startsWith(q) || c.keywords.any(::keywordMatches)
        }
    }

    fun MarketplaceCategory.toDto() = CategoryDto(key, label, plural)
}
