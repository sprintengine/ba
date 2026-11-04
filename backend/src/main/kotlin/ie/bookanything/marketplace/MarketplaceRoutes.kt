package ie.bookanything.marketplace

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.cachePublicly
import ie.bookanything.http.queryBool
import ie.bookanything.http.receiveBody
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import java.time.Duration

/** Matches the frontend's revalidation of the explore pages that read it. */
private val META_MAX_AGE = Duration.ofMinutes(5)

val MARKETPLACE_SEARCH_LIMIT = RateLimiter.Limit("marketplace-search", 120, 60)

private fun ApplicationCall.queryDouble(name: String): Double? =
    request.queryParameters[name]?.takeIf { it.isNotBlank() }?.let { it.toDoubleOrNull() ?: throw Errors.field(name, "Must be a number") }

private fun ApplicationCall.queryInt(name: String): Int? =
    request.queryParameters[name]?.takeIf { it.isNotBlank() }?.let {
        it.toIntOrNull() ?: throw Errors.field(name, "Must be a whole number")
    }

/** `GET /v1/public/marketplace/…` (public, rate-limited). */
fun Route.publicMarketplaceRoutes(ctx: AppContext) {
    get("/marketplace/meta") {
        // Fixed categories and per-city listing counts: the same for everyone, and a few minutes behind is fine.
        call.cachePublicly(META_MAX_AGE)
        call.respond(ctx.db.read { ctx.marketplace.meta(it) })
    }

    get("/marketplace/search") {
        ctx.rateLimiter.check(call, MARKETPLACE_SEARCH_LIMIT, ctx.now())
        val q = call.request.queryParameters
        val filter = SearchFilters.parse(
            SearchParams(
                q = q["q"], category = q["category"], city = q["city"], lat = call.queryDouble("lat"), lng = call.queryDouble("lng"),
                radiusKm = call.queryDouble("radiusKm"), available = q["available"]?.takeIf { it.isNotBlank() },
                date = q["date"]?.takeIf { it.isNotBlank() },
                minPriceCents = call.queryInt("minPrice"), maxPriceCents = call.queryInt("maxPrice"),
                deals =
                call.queryBool("deals") ?: false,
                limit = call.queryInt("limit"), cursor = q["cursor"],
            ),
        )
        call.respond(ctx.db.read { ctx.marketplace.search(it, filter, ctx.now()) })
    }
}

/** `GET/PUT /v1/businesses/{businessId}/marketplace` (owner/admin). */
fun Route.marketplaceSettingsRoutes(ctx: AppContext) {
    get("/marketplace") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        call.respond(ctx.db.read(access.businessId) { MarketplaceSettings.get(it, access.business) })
    }

    put("/marketplace") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<MarketplaceSettingsInput>()
        call.respond(ctx.db.tx(access.businessId) { MarketplaceSettings.update(it, access.business, input, access.actor, ctx.now()) })
    }
}
