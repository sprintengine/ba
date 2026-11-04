package ie.bookanything.mcp

import ie.bookanything.AppContext
import ie.bookanything.availability.AvailabilityDto
import ie.bookanything.booking.AvailabilityQuery
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.geo.IrishPlaces
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.parseDate
import ie.bookanything.http.parseInstant
import ie.bookanything.marketplace.MARKETPLACE_SEARCH_LIMIT
import ie.bookanything.marketplace.MarketplaceCategories
import ie.bookanything.marketplace.SearchFilters
import ie.bookanything.marketplace.SearchParams
import ie.bookanything.marketplace.SearchResultDto
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.serializer
import java.util.UUID

@Serializable
data class NearArgs(val latitude: Double, val longitude: Double)

@Serializable
data class SearchMarketplaceArgs(
    val query: String? = null,
    val city: String? = null,
    val near: NearArgs? = null,
    val radiusKm: Double? = null,
    val category: String? = null,
    val date: String? = null,
    val dealsOnly: Boolean = false,
    val limit: Int? = null,
    val cursor: String? = null,
)

@Serializable
data class CheckAvailabilityArgs(
    val slug: String,
    val serviceId: String,
    val from: String,
    val to: String? = null,
    val optionId: String? = null,
    val addonIds: List<String> = emptyList(),
    val resourceId: String? = null,
    val groupId: String? = null,
    val after: String? = null,
)

/** Marketplace and availability tools shared by the anonymous and the signed-in customer MCP servers. */
object MarketplaceTools {
    const val SLUG = "The business's slug: the path of its page, e.g. \"lumen-physio\" for https://bookanything.ie/lumen-physio"

    fun searchTool() = Tool(
        name = "search_marketplace",
        title = "Search businesses",
        description = "Search bookanything's marketplace of businesses in Ireland (physios, car washes, music teachers, GP practices, " +
            "salons, fitness studios and more). Filter by free text, city or a point with a radius, category, a date with free times " +
            "and deals. Results include each business's slug, distance, from-price, up to three next free times (with any deal price) " +
            "and active deals. Use the slug with the other tools. Categories: " +
            "${MarketplaceCategories.ALL.joinToString(", ") { it.key }}. " +
            "Cities: ${IrishPlaces.CITIES.joinToString(", ") { it.slug }}.",
        inputSchema = toolSchema {
            string("query", "Free text: a business name, a service or what the user needs (e.g. \"sports massage\")")
            string("city", "City slug or name, e.g. \"dublin\" (searches a 20 km radius unless radiusKm is set)")
            obj("near", "Search around this point instead of a city", listOf("latitude", "longitude")) {
                number("latitude", "Latitude in degrees", -90.0, 90.0)
                number("longitude", "Longitude in degrees", -180.0, 180.0)
            }
            number("radiusKm", "Search radius in km around city or near (1-200)", 1.0, 200.0)
            string("category", "Category key", enum = MarketplaceCategories.ALL.map { it.key })
            string("date", "Only businesses with a free time on this date (YYYY-MM-DD, business timezone)", format = "date")
            boolean("dealsOnly", "Only businesses with an active deal (off-peak or last-minute discount)")
            integer("limit", "Results per page (1-30, default 12)", 1, 30)
            string("cursor", "nextCursor from a previous result, to get the next page")
        },
        outputSchema = OutputSchemas.of(serializer<SearchResultDto>()),
        annotations = READ_ONLY,
    )

    suspend fun search(c: McpToolContext, raw: kotlinx.serialization.json.JsonObject): JsonElement {
        val ctx = c.ctx
        c.limit(MARKETPLACE_SEARCH_LIMIT)
        val a = StrictArgs.decode(serializer<SearchMarketplaceArgs>(), raw)
        val filter = SearchFilters.parse(
            SearchParams(
                q = a.query, category = a.category, city = a.city, lat = a.near?.latitude, lng = a.near?.longitude, radiusKm = a.radiusKm,
                date = a.date, deals = a.dealsOnly, limit = a.limit, cursor = a.cursor,
            ),
        )
        return McpResults.encode(serializer<SearchResultDto>(), ctx.db.read { ctx.marketplace.search(it, filter, ctx.now()) })
    }

    /** An active business by slug (draft and suspended businesses are not found). */
    suspend fun business(ctx: AppContext, slug: String?): BusinessRow {
        val s = slug?.trim()?.lowercase()?.takeIf { it.length in 1..60 } ?: throw Errors.field("slug", "Required")
        val b = ctx.db.read { BusinessRepository.findBySlug(it, s) }
        if (b == null || !b.isActive) throw Errors.notFound("Business")
        return b
    }

    fun availabilityTool(forCustomer: Boolean) = Tool(
        name = "check_availability",
        title = "Check availability",
        description = "Free start times for one service of a business between two dates (inclusive, at most 31 days; `to` defaults " +
            "to `from`), in the business's timezone. Services with options need optionId. Slots with a deal carry `offer` with the " +
            "discounted price. " + (
                if (forCustomer) {
                    "Uses the signed-in customer's own customer group at that business. "
                } else {
                    "Pass groupId for restricted customer groups. "
                }
                ) + "Pass resourceId to choose a specific person (e.g. a therapist). Some businesses offer only their next " +
            "available time: then the result has `nextAvailableOnly: true` and at most one time; call again with `after` set to " +
            "that time to see the next one. A day the business hasn't opened for booking yet has no times and `opensAt` (when " +
            "it opens), or `held: true` (not open yet, no time set).",
        inputSchema = toolSchema(listOf("slug", "serviceId", "from")) {
            string("slug", SLUG)
            string("serviceId", "Service id")
            string("from", "First date, YYYY-MM-DD", format = "date")
            string("to", "Last date, YYYY-MM-DD (default: from)", format = "date")
            string("optionId", "Option id (required when the service has options)")
            stringArray("addonIds", "Add-on ids")
            string("resourceId", "Selectable resource id, e.g. a specific therapist")
            if (!forCustomer) string("groupId", "Customer group id")
            string(
                "after", "Only times starting after this (ISO-8601 with offset); pass the last time you were shown to see later ones",
                format = "date-time",
            )
        },
        outputSchema = OutputSchemas.of(serializer<AvailabilityDto>()),
        annotations = READ_ONLY,
    )

    /** With [customerGroup] (signed-in customer MCP) the group is the customer's own and a `groupId` argument is rejected. */
    suspend fun availability(
        c: McpToolContext, raw: kotlinx.serialization.json.JsonObject, customerGroup: (suspend (BusinessRow) -> UUID?)?,
    ): JsonElement {
        val ctx = c.ctx
        c.limit(ie.bookanything.http.RateLimiter.AVAILABILITY)
        val a = StrictArgs.decode(serializer<CheckAvailabilityArgs>(), raw)
        if (customerGroup != null && a.groupId != null) throw Errors.field("groupId", "Unknown argument")
        val b = business(ctx, a.slug)
        val v = Validator()
        val serviceId = v.uuid(a.serviceId, "serviceId")
        val optionId = v.uuid(a.optionId, "optionId")
        val resourceId = v.uuid(a.resourceId, "resourceId")
        val addonIds = v.uuids(a.addonIds, "addonIds")
        val groupId = if (customerGroup != null) customerGroup(b) else v.uuid(a.groupId, "groupId")
        v.throwIfInvalid()
        val from = parseDate(a.from, "from")
        val to = if (a.to == null) from else parseDate(a.to, "to")
        val after = a.after?.let { parseInstant(it, "after", b.zone) }
        return McpResults.encode(
            serializer<AvailabilityDto>(),
            ctx.booking.public.availability(
                b, AvailabilityQuery(serviceId!!, DateRange(from, to), optionId, addonIds, groupId, resourceId, after),
            ),
        )
    }
}
