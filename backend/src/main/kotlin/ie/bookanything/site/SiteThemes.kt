package ie.bookanything.site

/** Theme choice from industries, business keywords and style words (generator and rule-based editor). */
object SiteThemes {
    val BY_INDUSTRY = mapOf(
        "physio" to SiteTheme.CALM, "gp_practice" to SiteTheme.CLINICAL, "car_wash" to SiteTheme.BOLD,
        "music_lessons" to SiteTheme.PLAYFUL, "salon" to SiteTheme.EDITORIAL, "fitness_class" to SiteTheme.BOLD,
        "generic" to SiteTheme.MINIMAL,
    )

    /** Business-type keywords, checked in this order (first group with a match wins). */
    private val KEYWORDS: List<Pair<SiteTheme, Regex>> = listOf(
        SiteTheme.CLINICAL to Regex("\\b(dental|dentist|clinic|medical|doctor|gp|surgery|practice nurse|pharmac|optician|optometr)"),
        SiteTheme.CALM to Regex("\\b(spa|massage|yoga|wellness|physio|therap|osteopath|chiropract|acupunct|reflexolog|meditat|pilates)"),
        SiteTheme.BOLD to Regex("\\b(car|cars|auto|automotive|valet|garage|detailing|gym|boxing|crossfit|martial|mechanic|tyre|tire)\\b"),
        SiteTheme.PLAYFUL to Regex(
            "\\b(kids|children|child|music|dance|art|arts|class|classes|lesson|lessons|tutor|tutoring|swim|play)\\b",
        ),
        SiteTheme.EDITORIAL to Regex("\\b(salon|barber|beauty|studio|photo|design|boutique|nail|lash|brow|tattoo|florist)"),
    )

    /** Words that ask for a look, for the generate prompt: theme names plus a few synonyms. */
    private val PROMPT_STYLE: List<Pair<SiteTheme, Regex>> = listOf(
        SiteTheme.CLINICAL to Regex("\\b(clinical|professional)\\b"),
        SiteTheme.CALM to Regex("\\b(calm|warm)\\b"),
        SiteTheme.BOLD to Regex("\\bbold\\b"),
        SiteTheme.PLAYFUL to Regex("\\bplayful\\b"),
        SiteTheme.EDITORIAL to Regex("\\b(editorial|elegant)\\b"),
        SiteTheme.MINIMAL to Regex("\\b(minimal|minimalist)\\b"),
    )

    /** Mood words for conversational edits ("make it warmer"). */
    private val MOODS: List<Pair<SiteTheme, Regex>> = listOf(
        SiteTheme.CLINICAL to Regex("\\b(clinical|professional|trustworthy|corporate)\\b"),
        SiteTheme.CALM to Regex("\\b(calm|calmer|warm|warmer|soft|softer|relaxed|relaxing|soothing|gentle|gentler)\\b"),
        SiteTheme.BOLD to Regex("\\b(bold|bolder|energetic|punchy|punchier|striking|louder)\\b"),
        SiteTheme.PLAYFUL to Regex("\\b(playful|fun|funner|friendly|friendlier|colourful|colorful|cheerful)\\b"),
        SiteTheme.EDITORIAL to Regex("\\b(editorial|elegant|sophisticated|magazine|luxurious|luxury|stylish|classy)\\b"),
        SiteTheme.MINIMAL to Regex("\\b(minimal|minimalist|simple|simpler|clean|cleaner|plain|plainer)\\b"),
    )

    private val THEME_NAMES: List<Pair<SiteTheme, Regex>> = SiteTheme.entries.map { it to Regex("\\b${it.key}\\b") }
    private val NEGATION = Regex("\\b(less|not|no|without|non|avoid)\\s+(too\\s+|so\\s+|very\\s+|as\\s+)?$")

    /** The first style word in [text] that is not negated ("less clinical"), mapped to a theme. */
    private fun firstMatch(text: String, groups: List<Pair<SiteTheme, Regex>>): SiteTheme? =
        groups.flatMap { (theme, re) -> re.findAll(text).map { it.range.first to theme } }
            .filter { (pos, _) -> !NEGATION.containsMatchIn(text.substring(0, pos)) }
            .minByOrNull { it.first }?.second

    fun fromPrompt(prompt: String?): SiteTheme? = prompt?.lowercase()?.let { firstMatch(it, PROMPT_STYLE) }

    /** An explicit theme name wins over mood words. */
    fun fromInstruction(instruction: String): SiteTheme? {
        val text = instruction.lowercase()
        return firstMatch(text, THEME_NAMES) ?: firstMatch(text, MOODS)
    }

    fun fromKeywords(text: String): SiteTheme? {
        val t = text.lowercase().replace('_', ' ')
        return KEYWORDS.firstOrNull { it.second.containsMatchIn(t) }?.first
    }

    /** Industry map first, then keywords in the industry, name and description, else minimal; a style word in the prompt overrides. */
    fun choose(industry: String, name: String, description: String?, prompt: String?): SiteTheme =
        fromPrompt(prompt)
            ?: BY_INDUSTRY[industry]
            ?: fromKeywords(industry)
            ?: fromKeywords(listOfNotNull(name, description, prompt).joinToString(" "))
            ?: SiteTheme.MINIMAL

    fun heroVariant(theme: SiteTheme) = when (theme) {
        SiteTheme.BOLD, SiteTheme.EDITORIAL -> HeroVariant.COVER
        SiteTheme.MINIMAL -> HeroVariant.MINIMAL
        SiteTheme.CLINICAL, SiteTheme.CALM, SiteTheme.PLAYFUL -> HeroVariant.SPLIT
    }

    fun pattern(theme: SiteTheme) = when (theme) {
        SiteTheme.CLINICAL -> GeneratedPattern.GRID
        SiteTheme.CALM -> GeneratedPattern.WAVES
        SiteTheme.BOLD -> GeneratedPattern.RAYS
        SiteTheme.PLAYFUL -> GeneratedPattern.DOTS
        SiteTheme.EDITORIAL -> GeneratedPattern.MESH
        SiteTheme.MINIMAL -> GeneratedPattern.AURORA
    }

    /** Accent per theme (null = none). All pass the accent contrast rule. */
    fun accent(theme: SiteTheme): String? = when (theme) {
        SiteTheme.CALM -> "#9a6b3f"
        SiteTheme.BOLD -> "#c2410c"
        SiteTheme.PLAYFUL -> "#db2777"
        SiteTheme.CLINICAL, SiteTheme.EDITORIAL, SiteTheme.MINIMAL -> null
    }
}
