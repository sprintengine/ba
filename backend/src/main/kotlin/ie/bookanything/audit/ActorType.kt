package ie.bookanything.audit

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Who performed an audited mutation (or created a site version); see [Actor]. Serialised as its [wire] value. */
@Serializable
enum class ActorType {
    /** The business owner, in the dashboard. */
    @SerialName("owner")
    OWNER,

    /** An admin or staff member, in the dashboard. */
    @SerialName("member")
    MEMBER,

    /** A signed-in customer. */
    @SerialName("customer")
    CUSTOMER,

    /** A customer who is not signed in (the public booking page, a manage link). */
    @SerialName("guest")
    GUEST,

    /** Jobs and webhooks. */
    @SerialName("system")
    SYSTEM,

    /** An AI feature on a member's behalf (Bo, the site builder). */
    @SerialName("ai")
    AI,

    /** An OAuth client on a customer's behalf (the customer MCP). */
    @SerialName("api")
    API,
    ;

    /** The `actor_type` database value and the JSON value. */
    val wire: String get() = name.lowercase()

    companion object {
        fun parse(wire: String): ActorType = entries.first { it.wire == wire }
    }
}
