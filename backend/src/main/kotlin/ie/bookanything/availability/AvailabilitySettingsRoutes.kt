package ie.bookanything.availability

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Validator
import ie.bookanything.http.pathUuid
import ie.bookanything.http.queryDate
import ie.bookanything.http.receiveBody
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import java.time.LocalDate

fun Route.availabilitySettingsRoutes(ctx: AppContext) {
    get("/resources/{resourceId}/availability") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val resourceId = call.pathUuid("resourceId")
        val from = call.queryDate("from") ?: LocalDate.ofInstant(ctx.now(), access.business.zone).minusDays(30)
        val body = ctx.db.read(access.businessId) { conn ->
            AvailabilityCommands.requireResource(conn, access, resourceId)
            ResourceAvailability(
                AvailabilityRepository.rules(conn, access.businessId, resourceId),
                AvailabilityRepository.overrides(conn, access.businessId, resourceId, from),
            )
        }
        call.respond(body)
    }

    put("/resources/{resourceId}/rules") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val resourceId = call.pathUuid("resourceId")
        ctx.db.read(access.businessId) { conn -> AvailabilityCommands.requireResource(conn, access, resourceId) }
        val input = call.receiveBody<ReplaceRulesInput>()
        val v = Validator()
        val rules = validateRules(input.rules, v)
        v.throwIfInvalid()
        val body = ctx.db.tx(access.businessId) { conn -> AvailabilityCommands.replaceRules(conn, access, resourceId, rules, access.actor) }
        call.respond(RulesResponse(body))
    }

    post("/resources/{resourceId}/overrides") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val resourceId = call.pathUuid("resourceId")
        ctx.db.read(access.businessId) { conn -> AvailabilityCommands.requireResource(conn, access, resourceId) }
        val input = call.receiveBody<AvailabilityOverrideInput>()
        val v = Validator()
        val o = validateOverride(input, v, closure = false)
        v.throwIfInvalid()
        val created = ctx.db.tx(access.businessId) { conn -> AvailabilityCommands.addOverride(conn, access, resourceId, o!!, access.actor) }
        call.respond(HttpStatusCode.Created, created)
    }

    delete("/overrides/{overrideId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("overrideId")
        ctx.db.tx(access.businessId) { conn -> AvailabilityCommands.deleteOverride(conn, access, id, access.actor) }
        call.respond(HttpStatusCode.NoContent)
    }

    get("/closures") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val from = call.queryDate("from") ?: LocalDate.ofInstant(ctx.now(), access.business.zone).minusDays(30)
        call.respond(ctx.db.read(access.businessId) { AvailabilityRepository.overrides(it, access.businessId, null, from) })
    }

    post("/closures") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<AvailabilityOverrideInput>()
        val v = Validator()
        val o = validateOverride(input, v, closure = true)
        v.throwIfInvalid()
        val created = ctx.db.tx(access.businessId) { conn -> AvailabilityCommands.addClosure(conn, access, o!!, access.actor) }
        call.respond(HttpStatusCode.Created, created)
    }
}
