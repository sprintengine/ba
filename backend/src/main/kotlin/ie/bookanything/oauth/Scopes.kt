package ie.bookanything.oauth

import kotlinx.serialization.Serializable

/**
 * The MCP servers our tokens are for (RFC 8707 resources): a customer's own bookings (`/mcp`) and the businesses a
 * member belongs to (`/mcp/business`). A token, a code and a grant are each for exactly one.
 */
enum class McpResource(val value: String) {
    CUSTOMER("customer"),
    BUSINESS("business"),
}

/**
 * Scopes, each of one [McpResource]. `bookings:write` implies `bookings:read`; `business:write` implies
 * `business:read`.
 */
enum class Scope(val value: String, val resource: McpResource, val label: String, val description: String) {
    BOOKINGS_READ("bookings:read", McpResource.CUSTOMER, "See your bookings", "See your upcoming and past bookings and their details."),
    BOOKINGS_WRITE(
        "bookings:write", McpResource.CUSTOMER, "Book, reschedule and cancel for you",
        "Make bookings in your name and move or cancel them. Paid bookings still need you to pay on bookanything yourself.",
    ),
    MARKETPLACE_READ(
        "marketplace:read", McpResource.CUSTOMER, "Search businesses",
        "Search the marketplace, see business details and check availability.",
    ),
    BUSINESS_READ(
        "business:read", McpResource.BUSINESS, "See your businesses",
        "See the schedule, bookings, customers, services, availability and (for admins) reports of the businesses you're " +
            "a member of, as your role allows.",
    ),
    BUSINESS_WRITE(
        "business:write", McpResource.BUSINESS, "Make changes, checking with you first",
        "Book, move and cancel, block time and make other changes as your role allows. Each change is prepared first, and the " +
            "app is told to check it with you before it goes ahead.",
    ),
    ;

    companion object {
        /** Requesting it is allowed (some clients add it to get refresh tokens); refresh tokens are always issued. */
        const val OFFLINE_ACCESS = "offline_access"
        val ALL: Set<Scope> = entries.toSet()

        /** The scopes of [resource]. */
        fun of(resource: McpResource): Set<Scope> = entries.filter { it.resource == resource }.toSet()

        fun byValue(value: String): Scope? = entries.firstOrNull { it.value == value }

        /** Scopes a token must hold for [required], honouring the hierarchy. */
        fun satisfies(granted: Set<Scope>, required: Scope): Boolean =
            required in granted ||
                (required == BOOKINGS_READ && BOOKINGS_WRITE in granted) ||
                (required == BUSINESS_READ && BUSINESS_WRITE in granted)

        /** Every scope [granted] satisfies, the implied ones included. */
        fun covered(granted: Set<Scope>): Set<Scope> = entries.filter { satisfies(granted, it) }.toSet()

        /** [scopes] without those another of them implies ({bookings:read, bookings:write} is {bookings:write}). */
        fun minimal(scopes: Set<Scope>): Set<Scope> = scopes.filterNot { satisfies(scopes - it, it) }.toSet()

        /**
         * What [requested] still holds of [granted]: never more than either, implied scopes counted. The requested scopes
         * [granted] covers are kept as they are; one it doesn't is cut down to what it implies that [granted] covers
         * (bookings:write against a grant of bookings:read is bookings:read).
         */
        fun within(requested: Set<Scope>, granted: Set<Scope>): Set<Scope> {
            val kept = requested.filter { satisfies(granted, it) }.toSet()
            val implied = covered(requested).intersect(covered(granted)).filterNot { satisfies(kept, it) }.toSet()
            return kept + minimal(implied)
        }

        fun format(scopes: Collection<Scope>): String = scopes.sortedBy { it.ordinal }.joinToString(" ") { it.value }
    }
}

/**
 * Parsing a space-delimited `scope` parameter, leniently: MCP clients routinely add scopes we don't have (`openid`,
 * `profile`, `email`) or copy every scope of the authorization server metadata, the other server's included. Refusing
 * those with `invalid_scope` would make the connection fail outright, so values that aren't scopes of the resource asked
 * for are dropped, and the token response's `scope` says what was granted (RFC 6749 3.3 lets the server grant less).
 */
object ScopeRequest {
    /** The scope values asked for, without `offline_access`. */
    fun values(raw: String?): List<String> =
        raw?.split(' ')?.map { it.trim() }?.filter { it.isNotEmpty() && it != Scope.OFFLINE_ACCESS }.orEmpty()

    /** The scopes of [resource] that [raw] names: unknown values and other resources' scopes are dropped. Empty when none remain. */
    fun requested(raw: String?, resource: McpResource): Set<Scope> =
        values(raw).mapNotNull(Scope::byValue).filter { it.resource == resource }.toSet()

    /**
     * The scopes to authorize: those of [resource] that [raw] names, or every scope of [resource] when none remain (absent,
     * empty, or only values we drop: the RFC 6749 3.3 default).
     */
    fun parse(raw: String?, resource: McpResource = McpResource.CUSTOMER): Set<Scope> =
        requested(raw, resource).ifEmpty { Scope.of(resource) }

    /**
     * The resource a request that names none is for: the business one when every scope asked for is a business
     * scope (a client that leaves out `resource` but asks for `business:*`), otherwise the customer one.
     */
    fun impliedResource(raw: String?): McpResource {
        val scopes = values(raw).mapNotNull(Scope::byValue)
        val business = scopes.isNotEmpty() && scopes.all { it.resource == McpResource.BUSINESS }
        return if (business) McpResource.BUSINESS else McpResource.CUSTOMER
    }
}

@Serializable
data class ScopeDto(val key: String, val label: String, val description: String)

fun Scope.toDto() = ScopeDto(value, label, description)
