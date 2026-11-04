package ie.bookanything.resources

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Patch
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveObject
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import java.util.UUID

fun Route.resourceRoutes(ctx: AppContext) {
    get("/resources") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val all = ctx.db.read(access.businessId) { ResourceRepository.list(it, access.businessId) }
        call.respond(if (access.isStaffOnly) all.filter { UUID.fromString(it.id) in access.linkedResourceIds } else all)
    }

    post("/resources") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<ResourceInput>()
        val created = ctx.db.tx(access.businessId) { conn -> ResourceCommands.create(conn, access, input, access.actor) }
        call.respond(HttpStatusCode.Created, created)
    }

    patch("/resources/{resourceId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("resourceId")
        val patch = Patch(call.receiveObject())
        call.respond(ctx.db.tx(access.businessId) { conn -> ResourceCommands.update(conn, access, id, patch, access.actor) })
    }

    delete("/resources/{resourceId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("resourceId")
        ctx.db.tx(access.businessId) { conn -> ResourceCommands.remove(conn, access, id) }
        call.respond(HttpStatusCode.NoContent)
    }
}
