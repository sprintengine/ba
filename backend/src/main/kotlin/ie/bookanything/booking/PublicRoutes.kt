package ie.bookanything.booking

import ie.bookanything.AppContext
import ie.bookanything.BusinessIdAttribute
import ie.bookanything.audit.Actor
import ie.bookanything.auth.Memberships
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.business.BusinessViews
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.cachePublicly
import ie.bookanything.http.queryInstant
import ie.bookanything.http.queryUuid
import ie.bookanything.http.queryUuidList
import ie.bookanything.http.receiveBody
import ie.bookanything.http.requireQueryDateRange
import ie.bookanything.templates.Templates
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import java.time.Duration

private val TEMPLATES_MAX_AGE = Duration.ofMinutes(15)

private val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9_\\-:.]{8,100}$")

fun ApplicationCall.idempotencyKey(): String? {
    val raw = request.headers["Idempotency-Key"]?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    if (!IDEMPOTENCY_KEY.matches(raw)) throw Errors.field("Idempotency-Key", "Use 8 to 100 letters, digits, '-', '_', ':' or '.'")
    return raw
}

/** Loads an active business by slug; drafts are visible to their members only. */
suspend fun loadPublicBusiness(ctx: AppContext, call: ApplicationCall): BusinessRow {
    val slug = call.parameters["slug"]?.lowercase()?.takeIf { it.length in 1..60 } ?: throw Errors.notFound("Business")
    val business = ctx.db.read { BusinessRepository.findBySlug(it, slug) } ?: throw Errors.notFound("Business")
    call.attributes.put(BusinessIdAttribute, business.id.toString())
    when (business.status) {
        "active" -> return business
        "draft" -> {
            val user = ctx.auth.optionalUser(call) ?: throw Errors.notFound("Business")
            ctx.db.read { Memberships.find(it, business.id, user.id) } ?: throw Errors.notFound("Business")
            return business
        }
        else -> throw Errors.notFound("Business")
    }
}

fun Route.publicRoutes(ctx: AppContext) {
    // Templates are part of the code: they change only with a deploy.
    get("/templates") {
        call.cachePublicly(TEMPLATES_MAX_AGE)
        call.respond(Templates.all.map { it.summary() })
    }

    get("/templates/{key}") {
        val t = Templates.byKey(call.parameters["key"].orEmpty()) ?: throw Errors.notFound("Template")
        call.cachePublicly(TEMPLATES_MAX_AGE)
        call.respond(t.setup.copy(source = "template"))
    }

    get("/businesses/{slug}") {
        val business = loadPublicBusiness(ctx, call)
        call.respond(
            ctx.db.read(business.id) { conn ->
                val public = BusinessViews.toPublic(ctx.payments, conn, business)
                // Without a site the frontend serves the booking portal at /{slug}.
                if (ctx.config.sitesEnabled) public.copy(site = ctx.site.service.publicSite(conn, business)) else public
            },
        )
    }

    get("/businesses/{slug}/services") {
        val business = loadPublicBusiness(ctx, call)
        call.respond(ctx.booking.public.services(business))
    }

    get("/businesses/{slug}/availability") {
        ctx.rateLimiter.check(call, RateLimiter.AVAILABILITY, ctx.now())
        val business = loadPublicBusiness(ctx, call)
        val serviceId = call.queryUuid("serviceId") ?: throw Errors.field("serviceId", "Required")
        val query = AvailabilityQuery(
            serviceId, call.requireQueryDateRange(), call.queryUuid("optionId"), call.queryUuidList("addonIds"), call.queryUuid("groupId"),
            call.queryUuid("resourceId"), call.queryInstant("after", business.zone),
        )
        call.respond(ctx.booking.public.availability(business, query))
    }

    post("/businesses/{slug}/bookings") {
        ctx.rateLimiter.check(call, RateLimiter.PUBLIC_BOOKING, ctx.now())
        val business = loadPublicBusiness(ctx, call)
        val user = ctx.auth.optionalUser(call)
        val key = call.idempotencyKey()
        val input = call.receiveBody<CreatePublicBooking>()
        val (result, replayed) = ctx.booking.public.create(
            business, input, user, key, source = BookingSource.PUBLIC, actor = Actor.customer(user?.id),
        )
        call.respond(if (replayed) HttpStatusCode.OK else HttpStatusCode.Created, result)
    }
}
