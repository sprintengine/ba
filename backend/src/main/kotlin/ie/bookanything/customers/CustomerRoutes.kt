package ie.bookanything.customers

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Patch
import ie.bookanything.http.pathUuid
import ie.bookanything.http.queryLimit
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveObject
import ie.bookanything.http.toPage
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post

fun Route.customerRoutes(ctx: AppContext) {
    get("/customers") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val q = call.request.queryParameters["q"]?.trim()?.take(100)
        val limit = call.queryLimit()
        val after = CustomerRepository.CURSOR.decode(call.request.queryParameters["cursor"])
        val rows = ctx.db.read(access.businessId) { conn ->
            CustomerRepository.list(conn, access.businessId, q, if (access.isStaffOnly) access.linkedResourceIds else null, after, limit)
        }
        call.respond(
            rows.toPage(limit, { CustomerRepository.CURSOR.encode(it.sortName to it.id) }) { it.toDto(access.business.zone) },
        )
    }

    get("/customers/{customerId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("customerId")
        call.respond(ctx.db.read(access.businessId) { conn -> CustomerCommands.detail(conn, access, id) })
    }

    post("/customers") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val details = CustomerDetails.from(call.receiveBody<CustomerInput>())
        val created = ctx.db.tx(access.businessId) { conn -> CustomerCommands.create(conn, access, details, ctx.now()) }
        call.respond(HttpStatusCode.Created, created.toDto(access.business.zone))
    }

    patch("/customers/{customerId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("customerId")
        val patch = Patch(call.receiveObject())
        val updated = ctx.db.tx(access.businessId) { conn -> CustomerCommands.update(conn, access, id, patch) }
        call.respond(updated.toDto(access.business.zone))
    }

    delete("/customers/{customerId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("customerId")
        ctx.db.tx(access.businessId) { conn -> CustomerCommands.erase(conn, access, id) }
        call.respond(HttpStatusCode.NoContent)
    }

    get("/customers/{customerId}/export") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("customerId")
        val export = ctx.db.tx(access.businessId) { conn -> CustomerCommands.export(conn, access, id, ctx.now()) }
        call.response.header(HttpHeaders.ContentDisposition, "attachment; filename=\"customer-$id.json\"")
        call.respond(export)
    }
}
