package ie.bookanything.mcp

import ie.bookanything.AppContext
import ie.bookanything.booking.PublicServiceDto
import ie.bookanything.business.BusinessViews
import ie.bookanything.business.PublicBusiness
import ie.bookanything.http.RateLimiter
import ie.bookanything.oauth.Scope
import io.ktor.server.application.ApplicationCall
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.ServerOptions
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.ServerCapabilities
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.serializer

@Serializable
data class SlugArgs(val slug: String)

/** Context of the anonymous MCP tools. */
class AnonymousToolContext(override val ctx: AppContext, val call: ApplicationCall) : McpToolContext {
    override suspend fun limit(limit: RateLimiter.Limit) = ctx.rateLimiter.check(call, limit, ctx.now())

    /** Anonymous callers hold no OAuth scopes. */
    override fun has(scope: Scope): Boolean = false
}

/**
 * The anonymous, read-only MCP server (`POST /v1/mcp`): search the marketplace, read a business's profile and
 * services, and check availability. Booking needs the signed-in customer MCP (`/v1/mcp/customer`, OAuth), so an
 * AI assistant always acts as a real, verified customer.
 */
object AnonymousMcp {
    val TOOLS: List<McpTool<AnonymousToolContext>> = listOf(
        McpTool(MarketplaceTools.searchTool(), null) { a -> MarketplaceTools.search(this, a) },
        McpTool(
            Tool(
                name = "find_business",
                title = "Find business",
                description = "A business's public profile by slug: name, description, address, contact details, timezone, currency, " +
                    "booking policies (notice, cancellation), customer groups, whether it takes online payments, and its booking page URL.",
                inputSchema = toolSchema(listOf("slug")) { string("slug", MarketplaceTools.SLUG) },
                annotations = READ_ONLY,
            ),
            null,
        ) { a ->
            val b = MarketplaceTools.business(ctx, StrictArgs.decode(serializer<SlugArgs>(), a).slug)
            val view = ctx.db.read(b.id) { BusinessViews.toPublic(ctx.payments, it, b) }
            JsonObject(
                McpResults.encode(
                    serializer<PublicBusiness>(),
                    view,
                ) as JsonObject + ("bookingUrl" to JsonPrimitive(ctx.config.urls.bookingPage(b.slug))),
            )
        },
        McpTool(
            Tool(
                name = "list_services",
                title = "List services",
                description =
                "The bookable services of a business: duration, price in minor units (cents), payment mode, options (choose " +
                    "one with optionId), add-ons, the selectable resource (e.g. a therapist) and the booking questions.",
                inputSchema = toolSchema(listOf("slug")) { string("slug", MarketplaceTools.SLUG) },
                annotations = READ_ONLY,
            ),
            null,
        ) { a ->
            val b = MarketplaceTools.business(ctx, StrictArgs.decode(serializer<SlugArgs>(), a).slug)
            JsonObject(
                mapOf(
                    "business" to JsonPrimitive(b.name), "currency" to JsonPrimitive(b.currency), "timezone" to JsonPrimitive(b.timezone),
                    "services" to McpResults.encode(ListSerializer(serializer<PublicServiceDto>()), ctx.booking.public.services(b)),
                ),
            )
        },
        McpTool(MarketplaceTools.availabilityTool(forCustomer = false), null) { a -> MarketplaceTools.availability(this, a, null) },
    )

    fun server(ctx: AppContext, call: ApplicationCall): Server = Server(
        Implementation(name = "bookanything", version = "1.1.0", title = "bookanything", websiteUrl = ctx.config.appBaseUrl),
        ServerOptions(capabilities = ServerCapabilities(tools = ServerCapabilities.Tools(listChanged = false))),
        "Search bookanything's marketplace of Irish businesses, read a business's services and check free times. This server is " +
            "read-only: to book, reschedule or cancel as the user, connect the signed-in bookanything server " +
            "(${ctx.oauth.config.resource}), " +
            "or send the user to the business's booking page.",
    ).apply { addTools(TOOLS, AnonymousToolContext(ctx, call)) }
}
