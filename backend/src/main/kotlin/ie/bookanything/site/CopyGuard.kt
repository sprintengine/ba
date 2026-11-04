package ie.bookanything.site

/**
 * Removes sentences from generated copy that make claims the business never gave us: prices and
 * money amounts, discounts, guarantees, cures and medical claims, rankings, awards, credentials,
 * years of experience and ratings (section 15.4). Blunt on purpose: a lost sentence is cheaper than
 * a false claim on someone's website.
 */
object CopyGuard {
    private val I = RegexOption.IGNORE_CASE

    private val BANNED: List<Regex> = listOf(
        // Money and prices.
        Regex("[€$£]\\s?\\d"),
        Regex("\\d\\s?(€|eur|euro|euros|usd|gbp|dollars?|pounds?|quid)\\b", I),
        Regex("\\b\\d+(?:[.,]\\d+)?\\s*(?:/|per)\\s*(?:session|hour|hr|class|lesson|visit|treatment|month|week|person)\\b", I),
        Regex("\\bprices?\\s+(?:from|start|starting)\\b", I),
        Regex("\\d\\s?%\\s?off\\b", I),
        Regex("\\bdiscount", I),
        Regex("\\bhalf[- ]price\\b", I),
        // Guarantees and medical claims.
        Regex("\\bguarantee", I),
        Regex("\\b(?:cure|cures|cured|curing|heal|heals|healed|healing)\\b", I),
        Regex("\\brisk[- ]free\\b", I),
        // Rankings, awards and ratings.
        Regex("#\\s?1\\b"),
        Regex("\\bnumber one\\b", I),
        Regex("\\bno\\.?\\s?1\\b", I),
        Regex("\\bbest in\\b", I),
        Regex("\\baward", I),
        Regex("\\b\\d(?:\\.\\d)?\\s*-?\\s*stars?\\b", I),
        Regex("\\b(?:five|four)[- ]star", I),
        Regex("[★⭐]"),
        Regex("\\b\\d(?:\\.\\d)?\\s*/\\s*(?:5|10)\\b"),
        Regex("\\b(?:top|highly|best)[- ]rated\\b", I),
        // Credentials and experience.
        Regex("\\b(?:certified|accredited|licensed|licenced|qualified)\\b", I),
        Regex("\\byears?\\s+of\\s+experience\\b", I),
        Regex("\\b\\d+\\+?\\s*years?\\b[^.!?]*\\bexperience\\b", I),
    )

    private val SENTENCE_END = Regex("(?<=[.!?])\\s+")

    fun flags(text: String): Boolean = BANNED.any { it.containsMatchIn(text) }

    /** [text] without the offending sentences (paragraph breaks kept); empty when nothing is left. */
    fun clean(text: String): String =
        text.split("\n").joinToString("\n") { line ->
            line.split(SENTENCE_END).filter { it.isNotBlank() && !flags(it) }.joinToString(" ")
        }.replace(Regex("\n{3,}"), "\n\n").trim()
}
