package ie.bookanything.customers

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

fun Route.customerGroupRoutes(ctx: AppContext) {
    get("/customer-groups") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(ctx.db.read(access.businessId) { CustomerGroupRepository.list(it, access.businessId) })
    }
    post("/customer-groups") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<CustomerGroupInput>()
        val created = ctx.db.tx(access.businessId) { conn -> CustomerGroupCommands.create(conn, access, input, access.actor) }
        call.respond(HttpStatusCode.Created, created)
    }
    patch("/customer-groups/{groupId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("groupId")
        val patch = Patch(call.receiveObject())
        call.respond(ctx.db.tx(access.businessId) { conn -> CustomerGroupCommands.update(conn, access, id, patch, access.actor) })
    }
    delete("/customer-groups/{groupId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("groupId")
        ctx.db.tx(access.businessId) { conn -> CustomerGroupCommands.remove(conn, access, id) }
        call.respond(HttpStatusCode.NoContent)
    }
}
