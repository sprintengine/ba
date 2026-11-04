package ie.bookanything.offers

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.booking.loadPublicBusiness
import ie.bookanything.businessAccess
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put

/** `/v1/businesses/{businessId}/offers…` (owner/admin). */
fun Route.offerRoutes(ctx: AppContext) {
    get("/offers") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        call.respond(ctx.db.read(access.businessId) { OfferService.list(it, access.business) })
    }

    post("/offers") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<OfferInput>()
        val dto = ctx.db.tx(access.businessId) { OfferService.create(it, access.business, input, access.actor, ctx.now()) }
        call.respond(HttpStatusCode.Created, dto)
    }

    post("/offers/preview") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<OfferPreviewInput>()
        call.respond(ctx.db.read(access.businessId) { OfferService.preview(it, access.business, input, ctx.now()) })
    }

    put("/offers/{offerId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("offerId")
        val input = call.receiveBody<OfferInput>()
        call.respond(ctx.db.tx(access.businessId) { OfferService.update(it, access.business, id, input, access.actor, ctx.now()) })
    }

    post("/offers/{offerId}/pause") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("offerId")
        call.respond(
            ctx.db.tx(access.businessId) { OfferService.setStatus(it, access.business, id, OfferStatus.PAUSED, access.actor, ctx.now()) },
        )
    }

    post("/offers/{offerId}/resume") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("offerId")
        call.respond(
            ctx.db.tx(access.businessId) { OfferService.setStatus(it, access.business, id, OfferStatus.ACTIVE, access.actor, ctx.now()) },
        )
    }

    delete("/offers/{offerId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("offerId")
        ctx.db.tx(access.businessId) { OfferService.delete(it, access.business, id, access.actor) }
        call.respond(HttpStatusCode.NoContent)
    }
}

/** `GET /v1/public/businesses/{slug}/offers`: the deals a customer can get now. */
fun Route.publicOfferRoutes(ctx: AppContext) {
    get("/businesses/{slug}/offers") {
        val business = loadPublicBusiness(ctx, call)
        call.respond(ctx.db.read(business.id) { OfferService.publicOffers(it, business, ctx.now()) })
    }
}
