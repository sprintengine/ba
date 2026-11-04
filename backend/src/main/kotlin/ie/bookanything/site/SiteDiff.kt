package ie.bookanything.site

import kotlin.math.abs

/**
 * Human change list between two plans ("Theme: Calm → Bold", "Added section: FAQ",
 * "Moved Testimonials up", "Hid section: Team", "Edited Hero"). Empty when nothing changed.
 */
object SiteDiff {
    fun changes(before: SitePlan, after: SitePlan): List<String> =
        styleChanges(before, after) + sectionChanges(before.sections, after.sections)

    private fun styleChanges(before: SitePlan, after: SitePlan): List<String> = listOfNotNull(
        "Theme: ${before.theme.label} → ${after.theme.label}".takeIf { before.theme != after.theme },
        "Palette: primary colour changed".takeIf { before.palette.primaryColor != after.palette.primaryColor },
        accentChange(before.palette.accent, after.palette.accent),
        "SEO updated".takeIf { before.seo != after.seo },
    )

    private fun accentChange(before: String?, after: String?): String? = when {
        before == after -> null
        after == null -> "Palette: accent colour removed"
        before == null -> "Palette: accent colour added"
        else -> "Palette: accent colour changed"
    }

    private fun sectionChanges(before: List<SiteSection>, after: List<SiteSection>): List<String> {
        val oldById = before.associateBy { it.id }
        val newById = after.associateBy { it.id }
        val added = after.filter { it.id !in oldById }.map { "Added section: ${label(it)}" }
        val removed = before.filter { it.id !in newById }.map { "Removed section: ${label(it)}" }
        val moved = moves(before.map { it.id }.filter { it in newById }, after.map { it.id }.filter { it in oldById })
            .map { (id, dir) -> "Moved ${label(newById.getValue(id))}${dir?.let { " $it" }.orEmpty()}" }
        val edited = after.flatMap { s -> oldById[s.id]?.let { edits(it, s) }.orEmpty() }
        return added + removed + moved + edited
    }

    /** What happened to one section that is in both plans. */
    private fun edits(o: SiteSection, s: SiteSection): List<String> = if (o.type != s.type) {
        listOf("Replaced ${label(o)} with ${label(s)}")
    } else {
        listOfNotNull(
            (if (s.enabled) "Showed section: ${label(s)}" else "Hid section: ${label(s)}").takeIf { o.enabled != s.enabled },
            "Edited ${label(s)}".takeIf { o.content != s.content },
        )
    }

    private fun label(s: SiteSection) = s.type.label

    /** Which sections moved, and which way: those [stayed] does not keep. */
    private fun moves(oldOrder: List<String>, newOrder: List<String>): List<Pair<String, String?>> {
        val oldIndex = oldOrder.withIndex().associate { it.value to it.index }
        val seq = newOrder.map { oldIndex.getValue(it) }
        val kept = stayed(seq)
        return seq.indices.filter { it !in kept }.map { i ->
            newOrder[i] to when {
                i < seq[i] -> "up"
                i > seq[i] -> "down"
                else -> null
            }
        }
    }

    /**
     * The new positions of the sections that stayed put, given each one's old position ([seq]): a longest increasing
     * subsequence (so moving one section reports only that one). Among equally long subsequences, the one keeping the
     * sections that moved least is chosen, and a section moved up is reported rather than the one it passed.
     */
    internal fun stayed(seq: List<Int>): Set<Int> {
        if (seq.isEmpty()) return emptySet()
        fun weight(i: Int): Int {
            val d = i - seq[i] // negative = moved up
            return -(abs(d) * 2 + if (d < 0) 1 else 0)
        }
        val len = IntArray(seq.size) { 1 }
        val score = IntArray(seq.size) { weight(it) }
        val prev = IntArray(seq.size) { -1 }
        fun better(l: Int, s: Int, i: Int) = l > len[i] || (l == len[i] && s > score[i])
        for (i in seq.indices) {
            for (j in (0 until i).filter { seq[it] < seq[i] }) {
                val l = len[j] + 1
                val s = score[j] + weight(i)
                if (better(l, s, i)) { len[i] = l; score[i] = s; prev[i] = j }
            }
        }
        val best = seq.indices.reduce { b, i -> if (better(len[i], score[i], b)) i else b }
        return generateSequence(best) { prev[it].takeIf { p -> p >= 0 } }.toSet()
    }
}
