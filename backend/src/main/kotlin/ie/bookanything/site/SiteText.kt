package ie.bookanything.site

/** Plain-text normalization shared by the validator and the repair of generated copy. */
object SiteText {
    private val BIDI = Regex("[\\u202A-\\u202E\\u2066-\\u2069]")
    private val SPACES = Regex(" {2,}")
    private val WHITESPACE = Regex("\\s+")
    private val BLANK_LINES = Regex("\n{3,}")

    /** Trimmed text with normalized whitespace, or null when it contains control or bidi-override characters. */
    fun clean(raw: String, multiline: Boolean): String? {
        val s = raw.replace("\r\n", "\n").replace('\r', '\n').replace('\t', ' ')
        if (s.any { it.isISOControl() && it != '\n' } || BIDI.containsMatchIn(s)) return null
        return if (multiline) {
            s.lines().joinToString("\n") { it.replace(SPACES, " ").trim() }.replace(BLANK_LINES, "\n\n").trim()
        } else {
            s.replace(WHITESPACE, " ").trim()
        }
    }

    /** At most [max] characters, cut at a word boundary when one is reasonably close. */
    fun truncate(text: String, max: Int): String {
        if (text.length <= max) return text
        val cut = text.take(max + 1)
        val boundary = cut.lastIndexOfAny(charArrayOf(' ', '\n'))
        val base = if (boundary >= max / 2) cut.take(boundary) else text.take(max)
        return base.trimEnd(' ', '\n', ',', ';', ':', '-', '–').trim()
    }
}
