package ie.bookanything.availability

import ie.bookanything.business.Policies
import java.time.Instant
import java.time.LocalDate

/**
 * Which free times a customer is shown: only those starting strictly after [after] (stepping forward), and with
 * [nextOnly] (the business's "offer the next available time only") just the earliest of them.
 */
data class ShownSlots(val after: Instant? = null, val nextOnly: Boolean = false) {
    companion object {
        /** Every free time: staff, Bo, marketplace cards and offers. */
        val ALL = ShownSlots()

        /** What a customer of a business with [policies] sees, from [after] on. */
        fun forCustomer(policies: Policies, after: Instant?) = ShownSlots(after, policies.nextAvailableOnly)
    }
}

/** The last step of customer availability (after offers and every booking rule): applies [ShownSlots]. */
object NextAvailable {
    /**
     * [days] with only the slots [shown] lets through. Every day stays in the result (the range is unchanged); with
     * `nextOnly` all but the day of the earliest remaining slot are empty.
     */
    fun shown(days: Map<LocalDate, List<ComputedSlot>>, shown: ShownSlots): Map<LocalDate, List<ComputedSlot>> {
        val after = shown.after
        val later = if (after == null) days else days.mapValues { (_, slots) -> slots.filter { it.start.isAfter(after) } }
        if (!shown.nextOnly) return later
        val next = later.values.flatten().minByOrNull { it.start }
        return later.mapValues { (_, slots) -> if (next != null && next in slots) listOf(next) else emptyList() }
    }
}
