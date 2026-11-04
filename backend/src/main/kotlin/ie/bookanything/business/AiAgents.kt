package ie.bookanything.business

import ie.bookanything.auth.Role
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Who may run the business from their own AI apps (the business MCP, section 20.7): nobody, owners and admins (the
 * default: whoever runs the business has it from the start), or the whole team. Only an owner changes it.
 */
@Serializable
enum class AiAgentsAccess(val key: String) {
    @SerialName("off") OFF("off"),
    @SerialName("admins") ADMINS("admins"),
    @SerialName("team") TEAM("team"),
    ;

    fun allows(role: Role): Boolean = when (this) {
        OFF -> false
        ADMINS -> role.atLeast(Role.ADMIN)
        TEAM -> true
    }

    companion object {
        fun parse(key: String) = entries.firstOrNull { it.key == key } ?: ADMINS
    }
}

/**
 * The kinds of change a member's AI app can propose. Each needs the member's approval on bookanything before it
 * happens, unless an owner lets that kind go ahead once the app confirms it (section 20.8). A change to several
 * bookings at once always needs approval.
 */
@Serializable
enum class AgentChangeKind(val key: String) {
    /** Booking notes and customer records. */
    @SerialName("records") RECORDS("records"),

    /** New bookings, moves, approving requests, outcomes, payments taken in person, payment links. */
    @SerialName("bookings") BOOKINGS("bookings"),

    /** Cancelling bookings and declining requests (may refund). */
    @SerialName("cancellations") CANCELLATIONS("cancellations"),

    /** Blocking time, closing dates and taking them back. */
    @SerialName("time_off") TIME_OFF("time_off"),

    /** Opening hours, services and deals. */
    @SerialName("settings") SETTINGS("settings"),
    ;

    companion object {
        fun parse(key: String): AgentChangeKind? = entries.firstOrNull { it.key == key }
    }
}

/** A business's rules for its members' AI apps. */
data class AiAgentsPolicy(
    val access: AiAgentsAccess = AiAgentsAccess.ADMINS,
    /** Kinds of change that go ahead without approval on bookanything, once the app confirms them. */
    val autoApprove: Set<AgentChangeKind> = emptySet(),
) {
    /** Whether a change of [kind] touching [count] items needs the member's approval on bookanything. */
    fun needsApproval(kind: AgentChangeKind, count: Int): Boolean = count > 1 || kind !in autoApprove
}
