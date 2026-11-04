package ie.bookanything.offers

import ie.bookanything.payments.Money
import java.time.DayOfWeek
import java.time.format.TextStyle

/** Short human descriptions of offers for badges and summaries (en-IE; the UI localises dates and money itself). */
object OfferText {
    private val locale = Money.EN_IE

    fun money(cents: Int, currency: String): String = Money.format(cents, currency)

    fun label(discount: Discount, currency: String): String = when (discount) {
        is Discount.Percent -> if (discount.percent == 100) "Free" else "${discount.percent}% off"
        is Discount.Fixed -> "${money(discount.amountCents, currency)} off"
    }

    fun summary(s: OfferSchedule): String {
        val parts = mutableListOf<String>()
        if (s.daysOfWeek.isNotEmpty() && s.daysOfWeek.size < java.time.DayOfWeek.entries.size) parts += days(s.daysOfWeek)
        if (s.windows.isNotEmpty()) parts += s.windows.joinToString(", ") { "${it.start}–${it.end}" }
        if (s.lastMinuteHours != null) {
            parts += "starting within ${s.lastMinuteHours} ${if (s.lastMinuteHours == 1) "hour" else "hours"}"
        }
        val text = if (parts.isEmpty()) "Any time" else parts.joinToString(", ")
        return text.replaceFirstChar { it.uppercase() }
    }

    /** "Mon–Fri", "Tue and Thu", "Sat, Sun". Consecutive runs of three or more collapse into a range. */
    fun days(days: Set<Int>): String {
        val sorted = days.sorted()
        val names = { d: Int -> DayOfWeek.of(d).getDisplayName(TextStyle.SHORT, locale) }
        val runs = mutableListOf<MutableList<Int>>()
        for (d in sorted) if (runs.isNotEmpty() && runs.last().last() == d - 1) runs.last() += d else runs += mutableListOf(d)
        val chunks = runs.flatMap { run -> if (run.size >= 3) listOf("${names(run.first())}–${names(run.last())}") else run.map(names) }
        return if (chunks.size == 2) chunks.joinToString(" and ") else chunks.joinToString(", ")
    }
}
