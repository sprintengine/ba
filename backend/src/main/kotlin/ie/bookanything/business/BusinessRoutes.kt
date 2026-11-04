package ie.bookanything.business

import ie.bookanything.AppContext
import ie.bookanything.audit.Audit
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.businessAccessByIdOrSlug
import ie.bookanything.http.BodyLimits
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveObject
import ie.bookanything.templates.BusinessSetup
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.onboardingRoutes(ctx: AppContext) {
    post("/businesses") {
        val user = ctx.auth.requireUser(call)
        ctx.rateLimiter.checkKey("user:${user.id}", RateLimiter.ONBOARDING, ctx.now())
        val setup = call.receiveBody<BusinessSetup>(BodyLimits.LARGE)
        val dto = ctx.db.tx { conn ->
            val id = SetupInstaller.install(conn, setup, user.id, ie.bookanything.audit.Actor.member(Role.OWNER, user.id))
            BusinessViews.toDto(
                ctx.payments, conn, BusinessRepository.findById(conn, id)!!, Role.OWNER, ctx.config.sitesEnabled,
                ctx.config.oauth.businessMcpEnabled, ctx.assistantAvailable,
            )
        }
        call.respond(HttpStatusCode.Created, dto)
    }

    get("/businesses/slug-available") {
        ctx.auth.requireUser(call)
        val raw = call.request.queryParameters["slug"]?.trim()?.lowercase() ?: throw Errors.field("slug", "Required")
        if (raw.length > 100) throw Errors.field("slug", "Too long")
        val result = ctx.db.read { conn ->
            val problem = ReservedSlugs.problem(raw)
            val taken = problem == null && BusinessRepository.slugExists(conn, raw)
            if (problem == null && !taken) {
                SlugAvailability(true, null)
            } else {
                SlugAvailability(false, SlugService.suggest(conn, ReservedSlugs.slugify(raw)))
            }
        }
        call.respond(result)
    }
}

fun Route.businessSettingsRoutes(ctx: AppContext) {
    // By id or by slug: the dashboard asks by the slug in its URL while /me is still loading.
    get {
        val access = call.businessAccessByIdOrSlug(ctx, Role.STAFF)
        call.respond(
            ctx.db.read(access.businessId) {
                BusinessViews.toDto(
                    ctx.payments, it, access.business, access.role, ctx.config.sitesEnabled,
                    ctx.config.oauth.businessMcpEnabled, ctx.assistantAvailable,
                )
            },
        )
    }

    patch {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val patch = Patch(call.receiveObject())
        val dto = ctx.db.tx(access.businessId) { conn ->
            BusinessSettings.update(conn, access, patch)
            val updated = BusinessRepository.findById(conn, access.businessId)!!
            BusinessViews.toDto(
                ctx.payments, conn, updated, access.role, ctx.config.sitesEnabled, ctx.config.oauth.businessMcpEnabled,
                ctx.assistantAvailable,
            )
        }
        call.respond(dto)
    }

    delete {
        val access = call.businessAccess(ctx, Role.OWNER)
        ctx.db.tx(access.businessId) { conn ->
            // Deleting takes the business offline but doesn't touch Stripe: a paid plan would go on billing, and its
            // owner would lose the billing portal along with the dashboard. They cancel it there first. Read under the
            // row lock that subscription webhooks also take, so a plan starting at the same moment is seen.
            val business = BusinessRepository.lockById(conn, access.businessId) ?: throw Errors.notFound("Business")
            if (business.hasPaidSubscription) {
                throw Errors.conflict(
                    "Cancel your plan in Billing first. Deleting the business doesn't stop its subscription. " +
                        "A plan set to end at the close of its billing period counts until it ends.",
                )
            }
            BusinessRepository.setStatus(conn, access.businessId, "suspended")
            Audit.record(conn, access.businessId, access.actor, "business.deleted", "business", access.businessId)
        }
        call.respond(HttpStatusCode.NoContent)
    }

    get("/overview") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(ctx.db.read(access.businessId) { conn -> BusinessOverview.compute(conn, access, ctx.payments, ctx.now()) })
    }
}

/** Mounts `/businesses/{businessId}` and nested business routes. */
fun Route.businessScoped(ctx: AppContext, nested: Route.() -> Unit) {
    route("/businesses/{businessId}") {
        businessSettingsRoutes(ctx)
        nested()
    }
}
