package ie.bookanything.site

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.BodyLimits
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.Validator
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveOptionalBody
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.site.stock.StockUnavailableException
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("ie.bookanything.site.SiteRoutes")

/** `/v1/businesses/{businessId}/site…` (section 15.5). Owners and admins only. */
fun Route.siteRoutes(ctx: AppContext) {
    route("/site") {
        get {
            val access = call.businessAccess(ctx, Role.ADMIN)
            call.respond(ctx.db.read(access.businessId) { conn -> ctx.site.service.state(conn, access) })
        }

        put {
            val access = call.businessAccess(ctx, Role.ADMIN)
            val input = call.receiveBody<SaveSiteInput>(BodyLimits.LARGE)
            call.respond(ctx.db.tx(access.businessId) { conn -> ctx.site.service.save(conn, access, input.plan, input.baseVersion) })
        }

        post("/publish") {
            val access = call.businessAccess(ctx, Role.ADMIN)
            call.respond(ctx.db.tx(access.businessId) { conn -> ctx.site.service.publish(conn, access) })
        }

        get("/versions") {
            val access = call.businessAccess(ctx, Role.ADMIN)
            call.respond(ctx.db.read(access.businessId) { conn -> ctx.site.service.versions(conn, access) })
        }

        get("/versions/{version}") {
            val access = call.businessAccess(ctx, Role.ADMIN)
            val version = call.pathVersion()
            call.respond(ctx.db.read(access.businessId) { conn -> ctx.site.service.version(conn, access, version) })
        }

        post("/versions/{version}/restore") {
            val access = call.businessAccess(ctx, Role.ADMIN)
            val version = call.pathVersion()
            call.respond(ctx.db.tx(access.businessId) { conn -> ctx.site.service.restore(conn, access, version) })
        }

        post("/generate") {
            val access = call.businessAccess(ctx, Role.ADMIN)
            ctx.rateLimiter.check(call, RateLimiter.AI_SITE, ctx.now())
            val input = call.receiveOptionalBody(serializer<GenerateSiteInput>(), GenerateSiteInput())
            val v = Validator()
            val prompt = v.requireText(input.prompt, "prompt", 2000, required = false)
            val websiteUrl = v.url(input.websiteUrl, "websiteUrl")
            v.throwIfInvalid()
            call.respond(ctx.site.ai.generate(access, prompt, websiteUrl))
        }

        post("/edit") {
            val access = call.businessAccess(ctx, Role.ADMIN)
            ctx.rateLimiter.check(call, RateLimiter.AI_SITE, ctx.now())
            val input = call.receiveBody<EditSiteInput>()
            val v = Validator()
            val instruction = v.requireText(input.instruction, "instruction", 500)
            v.throwIfInvalid()
            call.respond(ctx.site.ai.edit(access, instruction!!, input.baseVersion))
        }

        siteStockRoutes(ctx)
    }
}

/** Stock photo search for the image picker, and Unsplash download tracking when one is used. */
private fun Route.siteStockRoutes(ctx: AppContext) {
    get("/stock") {
        call.businessAccess(ctx, Role.ADMIN)
        if (!ctx.stockImages.enabled) return@get call.respond(StockSearchResult(enabled = false, results = emptyList()))
        val v = Validator()
        val query = v.requireText(call.request.queryParameters["q"], "q", 100)
        val page = call.request.queryParameters["page"]?.let { raw ->
            raw.toIntOrNull()?.takeIf { it in 1..50 } ?: run { v.error("page", "Must be between 1 and 50"); 1 }
        } ?: 1
        v.throwIfInvalid()
        ctx.rateLimiter.check(call, RateLimiter.STOCK_SEARCH, ctx.now())
        val results = withContext(Dispatchers.IO) {
            try {
                ctx.stockImages.search(query!!, page)
            } catch (e: StockUnavailableException) {
                log.warn("stock photo search failed: {}", e.message)
                throw Errors.stockUnavailable()
            }
        }
        call.respond(StockSearchResult(enabled = true, results = results))
    }

    post("/stock/download") {
        call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<StockDownloadInput>()
        val location = input.downloadLocation?.trim()
        if (location.isNullOrEmpty()) throw Errors.field("downloadLocation", "Required")
        if (!location.startsWith(StockImageProvider.DOWNLOAD_PREFIX) || location.length > 1000 || location.any { it.isWhitespace() }) {
            throw Errors.field("downloadLocation", "Must be an Unsplash download link")
        }
        withContext(Dispatchers.IO) { ctx.stockImages.trackDownload(location) }
        call.respond(HttpStatusCode.NoContent)
    }
}

private fun ApplicationCall.pathVersion(): Int =
    parameters["version"]?.toIntOrNull()?.takeIf { it > 0 } ?: throw Errors.field("version", "Must be a positive version number")
