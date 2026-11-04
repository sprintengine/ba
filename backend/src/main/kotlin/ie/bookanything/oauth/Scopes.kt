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

        fun format(scopes: Collection<Scope>): String = scopes.sortedBy { it.ordinal }.joinToString(" ") { it.value }
    }
}

/** Result of parsing a space-delimited `scope` parameter. */
sealed interface ScopeRequest {
    data class Valid(val scopes: Set<Scope>) : ScopeRequest
    data class Unknown(val values: List<String>) : ScopeRequest

    /** Known scopes of a resource other than the one the request is for. */
    data class OtherResource(val values: List<String>) : ScopeRequest

    companion object {
        /** The scope values asked for, without `offline_access`. */
        fun values(raw: String?): List<String> =
            raw?.split(' ')?.map { it.trim() }?.filter { it.isNotEmpty() && it != Scope.OFFLINE_ACCESS }.orEmpty()

        /** An absent or empty scope means every scope of [resource] (RFC 6749 3.3 default). */
        fun parse(raw: String?, resource: McpResource = McpResource.CUSTOMER): ScopeRequest {
            val values = values(raw)
            if (values.isEmpty()) return Valid(Scope.of(resource))
            val unknown = values.filter { Scope.byValue(it) == null }
            if (unknown.isNotEmpty()) return Unknown(unknown)
            val scopes = values.mapNotNull(Scope::byValue).toSet()
            val foreign = scopes.filter { it.resource != resource }
            return if (foreign.isNotEmpty()) OtherResource(foreign.map { it.value }) else Valid(scopes)
        }

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
}

@Serializable
data class ScopeDto(val key: String, val label: String, val description: String)

fun Scope.toDto() = ScopeDto(value, label, description)
