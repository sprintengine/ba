package ie.bookanything.services

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
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

fun Route.serviceRoutes(ctx: AppContext) {
    get("/services") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(ctx.db.read(access.businessId) { ServiceRepository.list(it, access.businessId) })
    }

    post("/services") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<ServiceInput>()
        val created = ctx.db.tx(access.businessId) { conn -> ServiceCommands.create(conn, access, input, access.actor) }
        call.respond(HttpStatusCode.Created, created)
    }

    put("/services/{serviceId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("serviceId")
        val input = call.receiveBody<ServiceInput>()
        call.respond(ctx.db.tx(access.businessId) { conn -> ServiceCommands.update(conn, access, id, input, access.actor) })
    }

    delete("/services/{serviceId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("serviceId")
        ctx.db.tx(access.businessId) { conn ->
            ServiceCommands.remove(conn, access, id)
        }
        call.respond(HttpStatusCode.NoContent)
    }
}
