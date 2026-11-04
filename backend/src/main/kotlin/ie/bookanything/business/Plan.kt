package ie.bookanything.business

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A business's bookanything plan (`business_plan`). Serialised as its [wire] value. */
@Serializable
enum class Plan(
    /** For people: "Pro". */
    val displayName: String,
    /** Online bookings a month; null: no limit. */
    val monthlyBookingLimit: Int?,
    /** Team members (active and invited); null: no limit. */
    val memberLimit: Int?,
) {
    @SerialName("free")
    FREE("Free", 100, 3),

    @SerialName("pro")
    PRO("Pro", null, null),

    @SerialName("business")
    BUSINESS("Business", null, null),
    ;

    /** The `business_plan` database value and the JSON value. */
    val wire: String get() = name.lowercase()

    /** A plan paid for: listed on the marketplace, no badge, AI overage, a Stripe subscription. */
    val isPaid: Boolean get() = this != FREE

    /** The plan to upgrade to for more, or null at the top. */
    val next: Plan? get() = entries.getOrNull(ordinal + 1)

    companion object {
        fun parse(wire: String): Plan = entries.first { it.wire == wire }

        /** The plan named by [wire], or null when it names none (client input, Stripe metadata). */
        fun parseOrNull(wire: String?): Plan? = entries.firstOrNull { it.wire == wire }
    }
}
