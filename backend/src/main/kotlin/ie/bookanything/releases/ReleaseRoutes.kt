package ie.bookanything.releases

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.parseDate
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.requireQueryDateRange
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put

/** `/v1/businesses/{businessId}/release-schedules…` and `/releases` (owner/admin; docs/architecture.md section 21). */
fun Route.releaseRoutes(ctx: AppContext) {
    get("/release-schedules") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        call.respond(ctx.db.read(access.businessId) { ReleaseService.list(it, access.business) })
    }

    post("/release-schedules") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<ReleaseScheduleInput>()
        val dto = ctx.db.tx(access.businessId) { ReleaseService.create(it, access.business, input, access.actor, ctx.now()) }
        call.respond(HttpStatusCode.Created, dto)
    }

    put("/release-schedules/{scheduleId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("scheduleId")
        val input = call.receiveBody<ReleaseScheduleInput>()
        call.respond(ctx.db.tx(access.businessId) { ReleaseService.update(it, access.business, id, input, access.actor, ctx.now()) })
    }

    delete("/release-schedules/{scheduleId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("scheduleId")
        ctx.db.tx(access.businessId) { ReleaseService.delete(it, access.business, id, access.actor) }
        call.respond(HttpStatusCode.NoContent)
    }

    put("/release-schedules/{scheduleId}/changes/{date}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("scheduleId")
        val date = parseDate(call.parameters["date"].orEmpty(), "date")
        val input = call.receiveBody<ReleaseChangeInput>()
        call.respond(
            ctx.db.tx(access.businessId) { ReleaseService.changeRelease(it, access.business, id, date, input, access.actor, ctx.now()) },
        )
    }

    delete("/release-schedules/{scheduleId}/changes/{date}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("scheduleId")
        val date = parseDate(call.parameters["date"].orEmpty(), "date")
        val scope = call.request.queryParameters["scope"]
        call.respond(
            ctx.db.tx(access.businessId) { ReleaseService.resetRelease(it, access.business, id, date, scope, access.actor, ctx.now()) },
        )
    }

    get("/releases") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val range = call.requireQueryDateRange()
        call.respond(ctx.db.read(access.businessId) { ReleaseService.releases(it, access.business, range, ctx.now()) })
    }
}
