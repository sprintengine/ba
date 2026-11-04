package ie.bookanything.templates

/** Converts HTML to readable text: drops scripts/styles/markup, keeps title and meta description. */
object HtmlText {
    private val DROP = Regex("(?is)<(script|style|noscript|svg|template|iframe)[^>]*>.*?</\\1\\s*>")
    private val COMMENTS = Regex("(?s)<!--.*?-->")
    private val BLOCK = Regex("(?i)</?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|nav|main|table)[^>]*>")
    private val TAGS = Regex("(?s)<[^>]+>")
    private val TITLE = Regex("(?is)<title[^>]*>(.*?)</title>")
    private val META_DESC = Regex("(?is)<meta[^>]+name=[\"']description[\"'][^>]*content=[\"']([^\"']*)[\"']")
    private val ENTITIES = mapOf(
        "&amp;" to "&", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"", "&#39;" to "'", "&apos;" to "'",
        "&nbsp;" to " ", "&euro;" to "€",
        "&ndash;" to "–", "&mdash;" to "—", "&rsquo;" to "’", "&lsquo;" to "‘", "&rdquo;" to "”", "&ldquo;" to "“", "&hellip;" to "…",
        "&pound;" to "£",
    )

    fun extract(html: String, maxChars: Int = 20_000): String {
        val title = TITLE.find(html)?.groupValues?.get(1)?.let(::clean)
        val description = META_DESC.find(html)?.groupValues?.get(1)?.let(::clean)
        var s = COMMENTS.replace(html, " ")
        s = DROP.replace(s, " ")
        s = BLOCK.replace(s, "\n")
        s = TAGS.replace(s, " ")
        val body = decode(s).lines().map { it.replace(Regex("[ \\t\\u00a0]+"), " ").trim() }.filter { it.isNotEmpty() }.joinToString("\n")
        return listOfNotNull(title?.let { "Title: $it" }, description?.let { "Description: $it" }, body).joinToString("\n").take(maxChars)
    }

    private fun clean(s: String) = decode(TAGS.replace(s, " ")).replace(Regex("\\s+"), " ").trim().takeIf { it.isNotEmpty() }

    private fun decode(s: String): String {
        var out = s
        ENTITIES.forEach { (k, v) -> out = out.replace(k, v, ignoreCase = true) }
        return Regex("&#(x?)([0-9a-fA-F]{1,6});").replace(out) { m ->
            val code = m.groupValues[2].toIntOrNull(if (m.groupValues[1].isNotEmpty()) 16 else 10)
            if (code != null && code in 32..0x10FFFF) String(Character.toChars(code)) else " "
        }
    }
}
